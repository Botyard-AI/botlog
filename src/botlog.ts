import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import { redactLine } from "./redaction.js";
import { listen } from "./server.js";
import { LogStore } from "./store.js";
import type {
  AttachableProcess,
  AttachedProcessOptions,
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
