import type {
  BotlogSnapshot,
  LogEntry,
  LogLevel,
  LogStreamSnapshot,
  StreamStatus,
} from "./types.js";

export type StoreEvent =
  | { readonly type: "entry"; readonly entry: LogEntry }
  | { readonly type: "stream"; readonly stream: LogStreamSnapshot };

type Subscriber = (event: StoreEvent) => void;

export interface LogStoreOptions {
  readonly title: string;
  readonly maxEntries: number;
}

export class LogStore {
  readonly #title: string;
  readonly #maxEntries: number;
  readonly #entries: LogEntry[] = [];
  readonly #streams = new Map<string, LogStreamSnapshot>();
  readonly #subscribers = new Set<Subscriber>();
  #nextEntryId = 1;

  constructor(options: LogStoreOptions) {
    this.#title = options.title;
    this.#maxEntries = options.maxEntries;
  }

  snapshot(): BotlogSnapshot {
    return {
      title: this.#title,
      streams: [...this.#streams.values()],
      entries: [...this.#entries],
    };
  }

  ensureStream(id: string, name: string): LogStreamSnapshot {
    const existing = this.#streams.get(id);
    if (existing !== undefined) {
      return existing;
    }

    const stream: LogStreamSnapshot = {
      id,
      name,
      status: "running",
      startedAt: new Date().toISOString(),
    };
    this.#streams.set(id, stream);
    this.#publish({ type: "stream", stream });
    return stream;
  }

  append(streamId: string, level: LogLevel, text: string): LogEntry {
    const entry: LogEntry = {
      id: this.#nextEntryId,
      streamId,
      level,
      text,
      timestamp: new Date().toISOString(),
    };
    this.#nextEntryId += 1;
    this.#entries.push(entry);

    if (this.#entries.length > this.#maxEntries) {
      this.#entries.splice(0, this.#entries.length - this.#maxEntries);
    }

    this.#publish({ type: "entry", entry });
    return entry;
  }

  updateStreamStatus(streamId: string, status: StreamStatus, exitCode?: number | null): void {
    const current = this.#streams.get(streamId);
    if (current === undefined) {
      return;
    }

    const updated: LogStreamSnapshot = {
      ...current,
      status,
      ...(exitCode === undefined ? {} : { exitCode }),
      endedAt: new Date().toISOString(),
    };
    this.#streams.set(streamId, updated);
    this.#publish({ type: "stream", stream: updated });
  }

  subscribe(subscriber: Subscriber): () => void {
    this.#subscribers.add(subscriber);
    return () => {
      this.#subscribers.delete(subscriber);
    };
  }

  #publish(event: StoreEvent): void {
    for (const subscriber of this.#subscribers) {
      subscriber(event);
    }
  }
}
