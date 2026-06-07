import { randomUUID } from "node:crypto";
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
    this.#redactors = options.redact ?? [];
  }

  createStream(name: string): BotlogStream {
    const id = slugify(name) || randomUUID();
    this.#store.ensureStream(id, name);
    return new BotlogStream({ id, store: this.#store, redactors: this.#redactors });
  }

  attachProcess(
    name: string,
    child: AttachableProcess,
    options: AttachedProcessOptions = {}
  ): BotlogStream {
    const stream = this.createStream(name);

    attachReadable(child.stdout, (line) => {
      stream.write(`${options.stdoutPrefix ?? ""}${line}`);
    });
    attachReadable(child.stderr, (line) => {
      stream.error(`${options.stderrPrefix ?? ""}${line}`);
    });

    child.once("exit", (code: number | null) => {
      stream.end(code === 0 ? "completed" : "failed", code);
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
      stream: snapshot,
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

  listen(options: ListenOptions): void {
    listen(this.#store, options);
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
  let position = options.fromBeginning === true ? 0 : (await stat(path)).size;
  let buffer = "";
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  let closed = false;

  async function readNewBytes(): Promise<void> {
    const file = await open(path, "r");
    try {
      const current = await file.stat();
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
  }

  await readNewBytes();
  const interval = setInterval(() => {
    if (closed) {
      return;
    }
    void readNewBytes().catch((error: unknown) => {
      stream.error(error instanceof Error ? error.message : String(error));
    });
  }, pollIntervalMs);

  return {
    close() {
      closed = true;
      clearInterval(interval);
      if (buffer.length > 0) {
        stream.write(buffer);
        buffer = "";
      }
      stream.end("completed", 0);
    },
  };
}

function attachReadable(readable: Readable | null, onLine: (line: string) => void): void {
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
  });
}

function splitLines(text: string): readonly string[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  return lines.length > 0 ? lines : [""];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
