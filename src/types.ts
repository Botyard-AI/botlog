import type { ChildProcess } from "node:child_process";

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

export type Redactor = string | RegExp | ((line: string) => string);

export interface BotlogOptions {
  readonly title?: string;
  readonly maxEntries?: number;
  readonly redact?: readonly Redactor[];
}

export interface ListenOptions {
  readonly port: number;
  readonly hostname?: string;
}

export interface AttachedProcessOptions {
  readonly stdoutPrefix?: string;
  readonly stderrPrefix?: string;
}

export type AttachableProcess = Pick<ChildProcess, "stdout" | "stderr" | "once">;
