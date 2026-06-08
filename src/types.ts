import type { Readable } from "node:stream";

export type LogLevel = "info" | "error";
export type StreamStatus = "running" | "completed" | "failed";

export interface LogEntry {
  readonly id: number;
  readonly streamId: string;
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly text: string;
}

export interface LogStreamSnapshot {
  readonly id: string;
  readonly name: string;
  readonly status: StreamStatus;
  readonly exitCode?: number | null;
  readonly startedAt: string;
  readonly endedAt?: string;
}

export interface BotlogSnapshot {
  readonly title: string;
  readonly streams: readonly LogStreamSnapshot[];
  readonly entries: readonly LogEntry[];
}

export interface BotlogInfo {
  readonly name: "botlog";
  readonly runId?: string;
  readonly title: string;
  readonly startedAt: string;
}

export type Redactor = string | RegExp | ((line: string) => string);

export interface BotlogOptions {
  readonly title?: string;
  readonly maxEntries?: number;
  readonly redact?: readonly Redactor[];
  readonly runId?: string;
}

export interface ListenOptions {
  readonly port: number;
  readonly hostname?: string;
}

export interface BotlogServer {
  readonly port: number;
  close(): Promise<void>;
}

export interface AttachedProcessOptions {
  readonly stdoutPrefix?: string;
  readonly stderrPrefix?: string;
}

export interface AttachFileOptions {
  readonly fromBeginning?: boolean;
  readonly pollIntervalMs?: number;
}

export interface AttachedFile {
  readonly path: string;
  readonly stream: BotlogStreamHandle;
  close(): void;
}

export interface BotlogStreamHandle {
  readonly id: string;
  write(text: string): void;
  info(text: string): void;
  error(text: string): void;
  end(status?: StreamStatus, exitCode?: number | null): void;
}

export interface AttachableProcess {
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  once(event: "exit", listener: (code: number | null) => void): unknown;
}
