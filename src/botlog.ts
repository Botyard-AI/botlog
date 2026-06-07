import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename } from "node:path";
import type { Readable } from "node:stream";

import { redactLine } from "./redaction.js";
import { listen } from "./server.js";
import { LogStore } from "./store.js";
import type {
  AttachableProcess,
  AttachedFile,
  AttachedProcessOptions,
  AttachFileOptions,
  BotlogOptions,
  BotlogServer,
  BotlogSnapshot,
  ListenOptions,
  LogLevel,
  Redactor,
  StreamStatus,
} from "./types.js";

export class Botlog {
  readonly #store: LogStore;
  readonly #redactors: readonly Redactor[];

  constructor(options: BotlogOptions = {}) {
    this.#store = new LogStore({
      title: options.title ?? "Botlog",
      maxEntries: options.maxEntries ?? 10_000,
    });
    this.#redactors = [...(options.redact ?? [])];
  }

  createStream(name: string): BotlogStream {
    const id = this.#createStreamId(name);
    this.#store.ensureStream(id, name);
    return new BotlogStream({ id, store: this.#store, redactors: this.#redactors });
  }

  #createStreamId(name: string): string {
    const baseId = slugify(name) || randomUUID();
    const existingIds = new Set(this.#store.snapshot().streams.map((stream) => stream.id));
    if (!existingIds.has(baseId)) {
      return baseId;
    }

    let suffix = 2;
    while (existingIds.has(`${baseId}-${String(suffix)}`)) {
      suffix += 1;
    }
    return `${baseId}-${String(suffix)}`;
  }

  attachProcess(
    name: string,
    child: AttachableProcess,
    options: AttachedProcessOptions = {}
  ): BotlogStream {
    const stream = this.createStream(name);

    let exitCode: number | null | undefined;
    let endedReadables = 0;
    const expectedReadables = Number(child.stdout !== null) + Number(child.stderr !== null);

    const maybeEndStream = (): void => {
      if (exitCode === undefined || endedReadables < expectedReadables) {
        return;
      }
      stream.end(exitCode === 0 ? "completed" : "failed", exitCode);
    };

    attachReadable(
      child.stdout,
      (line) => {
        stream.write(`${options.stdoutPrefix ?? ""}${line}`);
      },
      () => {
        endedReadables += 1;
        maybeEndStream();
      }
    );
    attachReadable(
      child.stderr,
      (line) => {
        stream.error(`${options.stderrPrefix ?? ""}${line}`);
      },
      () => {
        endedReadables += 1;
        maybeEndStream();
      }
    );

    child.once("exit", (code: number | null) => {
      exitCode = code;
      maybeEndStream();
    });

    return stream;
  }

  async attachFile(path: string, options: AttachFileOptions = {}): Promise<AttachedFile> {
    const name = basename(path);
    const stream = this.createStream(name);
    const watcher = await tailFile(path, stream, options);
    const snapshot = this.snapshot().streams.find((item) => item.id === stream.id);

    if (snapshot === undefined) {
      throw new Error(`Failed to attach log file stream for ${path}`);
    }

    return {
      path,
      stream,
      close: () => {
        watcher.close();
      },
    };
  }

  async attachFiles(
    paths: readonly string[],
    options: AttachFileOptions = {}
  ): Promise<readonly AttachedFile[]> {
    return Promise.all(paths.map((path) => this.attachFile(path, options)));
  }

  snapshot(): BotlogSnapshot {
    return this.#store.snapshot();
  }

  listen(options: ListenOptions): BotlogServer {
    return listen(this.#store, options);
  }
}

interface BotlogStreamOptions {
  readonly id: string;
  readonly store: LogStore;
  readonly redactors: readonly Redactor[];
}

export class BotlogStream {
  readonly #id: string;
  readonly #store: LogStore;
  readonly #redactors: readonly Redactor[];

  constructor(options: BotlogStreamOptions) {
    this.#id = options.id;
    this.#store = options.store;
    this.#redactors = options.redactors;
  }

  get id(): string {
    return this.#id;
  }

  write(text: string): void {
    this.#append("info", text);
  }

  info(text: string): void {
    this.#append("info", text);
  }

  error(text: string): void {
    this.#append("error", text);
  }

  end(status: StreamStatus = "completed", exitCode?: number | null): void {
    this.#store.updateStreamStatus(this.#id, status, exitCode);
  }

  #append(level: LogLevel, text: string): void {
    for (const line of splitLines(text)) {
      this.#store.append(this.#id, level, redactLine(line, this.#redactors));
    }
  }
}

interface FileWatcher {
  close(): void;
}

async function tailFile(
  path: string,
  stream: BotlogStream,
  options: AttachFileOptions
): Promise<FileWatcher> {
  const initialStat = await stat(path);
  let fileIdentity = getFileIdentity(initialStat);
  let position = options.fromBeginning === true ? 0 : initialStat.size;
  let buffer = "";
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  let closed = false;
  let reading = false;
  let readAgain = false;

  async function readNewBytes(): Promise<void> {
    if (reading) {
      readAgain = true;
      return;
    }

    reading = true;
    try {
      const file = await open(path, "r").catch((error: unknown) => {
        position = 0;
        buffer = "";
        throw error;
      });
      try {
        const current = await file.stat();
        const currentIdentity = getFileIdentity(current);
        if (currentIdentity !== fileIdentity) {
          fileIdentity = currentIdentity;
          position = 0;
          buffer = "";
        }
        if (current.size < position) {
          position = 0;
          buffer = "";
        }
        if (current.size === position) {
          return;
        }

        const length = current.size - position;
        const bytes = Buffer.alloc(length);
        await file.read(bytes, 0, length, position);
        position = current.size;
        buffer += bytes.toString("utf8");

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          stream.write(line);
        }
      } finally {
        await file.close();
      }
    } finally {
      reading = false;
    }

    if (readAgain) {
      readAgain = false;
      await readNewBytes();
    }
  }

  function scheduleRead(): void {
    if (closed) {
      return;
    }
    void readNewBytes().catch((error: unknown) => {
      stream.error(error instanceof Error ? error.message : String(error));
    });
  }

  await readNewBytes();
  const watcher = watch(path, scheduleRead);
  watcher.on("error", (error) => {
    stream.error(error.message);
  });
  const interval = setInterval(scheduleRead, pollIntervalMs);

  return {
    close() {
      closed = true;
      watcher.close();
      clearInterval(interval);
      if (buffer.length > 0) {
        stream.write(buffer);
        buffer = "";
      }
      stream.end("completed", 0);
    },
  };
}

interface FileIdentitySource {
  readonly dev: number;
  readonly ino: number;
}

function getFileIdentity(stats: FileIdentitySource): string {
  return `${String(stats.dev)}:${String(stats.ino)}`;
}

function attachReadable(
  readable: Readable | null,
  onLine: (line: string) => void,
  onEnd: () => void
): void {
  if (readable === null) {
    return;
  }

  let buffer = "";
  readable.setEncoding("utf8");
  readable.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      onLine(line);
    }
  });
  readable.on("end", () => {
    if (buffer.length > 0) {
      onLine(buffer);
    }
    onEnd();
  });
}

function splitLines(text: string): readonly string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
