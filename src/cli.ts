#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Writable } from "node:stream";

import { Botlog } from "./botlog.js";
import { redactLine } from "./redaction.js";
import type { BotlogInfo, Redactor } from "./types.js";

const require = createRequire(import.meta.url);
const packageVersion =
  (require("../package.json") as { readonly version?: string }).version ?? "0.0.0";

export interface CliOptions {
  readonly host: string;
  readonly port: number;
  readonly title?: string;
  readonly files: readonly string[];
  readonly fromBeginning: boolean;
  readonly pollIntervalMs: number;
  readonly maxLines: number;
  readonly redactors: readonly RegExp[];
  readonly json: boolean;
  readonly keepOpen: boolean;
  readonly open: boolean;
  readonly runDir?: string;
  readonly command: readonly string[];
  readonly help: boolean;
  readonly version: boolean;
}

export interface RunManifest {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly title: string;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly serverPid: number;
  readonly childPid?: number;
  readonly startedAt: string;
  readonly files: {
    readonly stdout?: string;
    readonly stderr?: string;
    readonly attached: readonly string[];
  };
}

export interface ReadyEvent {
  readonly event: "ready";
  readonly url: string;
  readonly host: string;
  readonly port: number;
  readonly title: string;
  readonly runId?: string;
  readonly runDir?: string;
  readonly reused: boolean;
}

interface ResolvedRunDir {
  readonly path: string;
  readonly runId: string;
  readonly manifestPath: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const files: string[] = [];
  const redactors: RegExp[] = [];
  const command: string[] = [];
  let host = "127.0.0.1";
  let port = 3030;
  let title: string | undefined;
  let fromBeginning = false;
  let pollIntervalMs = 500;
  let maxLines = 10_000;
  let json = false;
  let keepOpen = false;
  let open = false;
  let runDir: string | undefined;
  let help = false;
  let version = false;

  const args = [...argv];
  if (args[0] === "run" || args[0] === "serve") {
    args.shift();
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      break;
    }
    if (arg === "--") {
      command.push(...args.slice(index + 1));
      break;
    }

    if (arg === "-h" || arg === "--help") {
      help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      version = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--keep-open") {
      keepOpen = true;
      continue;
    }
    if (arg === "--open") {
      open = true;
      continue;
    }
    if (arg === "--from-beginning") {
      fromBeginning = true;
      continue;
    }

    if (arg === "--host") {
      host = readValue(args, (index += 1), arg);
      continue;
    }
    if (arg === "--port") {
      port = parseInteger(readValue(args, (index += 1), arg), arg, { min: 0, max: 65_535 });
      continue;
    }
    if (arg === "--title") {
      title = readValue(args, (index += 1), arg);
      continue;
    }
    if (arg === "--file") {
      files.push(readValue(args, (index += 1), arg));
      continue;
    }
    if (arg === "--poll-interval-ms") {
      pollIntervalMs = parseInteger(readValue(args, (index += 1), arg), arg, { min: 1 });
      continue;
    }
    if (arg === "--max-lines") {
      maxLines = parseInteger(readValue(args, (index += 1), arg), arg, { min: 1 });
      continue;
    }
    if (arg === "--redact") {
      redactors.push(new RegExp(readValue(args, (index += 1), arg), "g"));
      continue;
    }
    if (arg === "--run-dir" || arg === "--log-dir") {
      runDir = readValue(args, (index += 1), arg);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return {
    host,
    port,
    ...(title === undefined ? {} : { title }),
    files,
    fromBeginning,
    pollIntervalMs,
    maxLines,
    redactors,
    json,
    keepOpen,
    open,
    ...(runDir === undefined ? {} : { runDir }),
    command,
    help,
    version,
  };
}

export function renderHelp(): string {
  return `Usage:
  botlog [options] -- <command> [args...]
  botlog [options] --file <path> [--file <path>...]
  botlog run [options] -- <command> [args...]
  botlog serve [options] --file <path>

Options:
  --host <host>              Host to bind, default 127.0.0.1
  --port <port>              Port to bind, default 3030. Use 0 for a random port.
  --title <title>            UI title
  --file <path>              Tail a file. Repeatable.
  --from-beginning           Read attached files from the beginning.
  --poll-interval-ms <ms>    File polling interval, default 500.
  --max-lines <count>        Max in-memory log entries, default 10000.
  --redact <regex>           Redact matching text. Repeatable.
  --json                     Print a machine-readable ready event.
  --open                     Open the log UI in the default browser.
  --keep-open                Keep serving after the child process exits.
  --run-dir <dir>            Write/reuse a run manifest and stdout/stderr logs.
  --log-dir <dir>            Alias for --run-dir.
  -h, --help                 Show help.
  -v, --version              Show version.
`;
}

export async function runCli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const options = parseCliArgs(argv);

  if (options.help) {
    console.log(renderHelp());
    return 0;
  }
  if (options.version) {
    console.log(packageVersion);
    return 0;
  }
  if (options.command.length === 0 && options.files.length === 0 && options.runDir === undefined) {
    console.error(
      "Provide a command after --, one or more --file paths, or --run-dir to recover logs."
    );
    console.error(renderHelp());
    return 2;
  }

  const runDir = options.runDir === undefined ? undefined : resolveRunDir(options.runDir);
  const reuse =
    runDir === undefined ? undefined : { runDir, manifest: await readReusableManifest(runDir) };
  if (reuse?.manifest !== undefined) {
    printReady(
      {
        event: "ready",
        url: reuse.manifest.url,
        host: reuse.manifest.host,
        port: reuse.manifest.port,
        title: reuse.manifest.title,
        runId: reuse.manifest.runId,
        runDir: reuse.runDir.path,
        reused: true,
      },
      options.json
    );
    return 0;
  }

  if (runDir !== undefined) {
    await mkdir(runDir.path, { recursive: true });
  }

  const redactors: readonly Redactor[] = options.redactors;
  const title = redactLine(
    options.title ?? inferTitle(options.command, options.files, runDir),
    redactors
  );
  const botlog = new Botlog({
    title,
    maxEntries: options.maxLines,
    redact: redactors,
    ...(runDir === undefined ? {} : { runId: runDir.runId }),
  });

  const attachedFiles = [...options.files];
  if (runDir !== undefined && options.command.length === 0) {
    attachedFiles.push(runDir.stdoutPath, runDir.stderrPath);
  }

  for (const file of attachedFiles) {
    await botlog.attachFile(file, {
      fromBeginning: options.fromBeginning || runDir !== undefined,
      pollIntervalMs: options.pollIntervalMs,
    });
  }

  const child = options.command.length > 0 ? spawnCommand(options.command) : undefined;
  const childExit = child === undefined ? undefined : trackChild(child);
  const stdioFiles =
    runDir === undefined || child === undefined
      ? undefined
      : createRunLogWriters(runDir, redactors);

  if (child !== undefined) {
    if (stdioFiles !== undefined) {
      teeReadable(child.stdout, options.json ? undefined : process.stdout, stdioFiles.stdout);
      teeReadable(child.stderr, options.json ? undefined : process.stderr, stdioFiles.stderr);
    }
    botlog.attachProcess(redactLine(options.command.join(" "), redactors), child);
  }

  const server = botlog.listen({ port: options.port, hostname: options.host });
  const port = await waitForBoundPort(server);
  const url = `http://${options.host}:${String(port)}`;
  const ready: ReadyEvent = {
    event: "ready",
    url,
    host: options.host,
    port,
    title,
    ...(runDir === undefined ? {} : { runId: runDir.runId, runDir: runDir.path }),
    reused: false,
  };

  if (runDir !== undefined) {
    await writeManifest(runDir, {
      schemaVersion: 1,
      runId: runDir.runId,
      title,
      host: options.host,
      port,
      url,
      serverPid: process.pid,
      ...(child?.pid === undefined ? {} : { childPid: child.pid }),
      startedAt: new Date().toISOString(),
      files: {
        ...(child === undefined ? {} : { stdout: runDir.stdoutPath, stderr: runDir.stderrPath }),
        attached: attachedFiles,
      },
    });
  }

  printReady(ready, options.json);
  if (options.open) {
    openBrowser(url);
  }

  if (child === undefined) {
    await waitForShutdown(server);
    return 0;
  }

  const exitCode = await childExit;
  await closeWriters(stdioFiles);
  if (options.keepOpen) {
    await waitForShutdown(server);
  } else {
    await server.close();
  }
  return exitCode ?? 1;
}

async function waitForBoundPort(server: { readonly port: number }): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.port !== 0) {
      return server.port;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return server.port;
}

function readValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseInteger(
  value: string,
  option: string,
  bounds: { readonly min?: number; readonly max?: number }
): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value) {
    throw new Error(`${option} must be an integer`);
  }
  if (bounds.min !== undefined && parsed < bounds.min) {
    throw new Error(`${option} must be >= ${String(bounds.min)}`);
  }
  if (bounds.max !== undefined && parsed > bounds.max) {
    throw new Error(`${option} must be <= ${String(bounds.max)}`);
  }
  return parsed;
}

function inferTitle(
  command: readonly string[],
  files: readonly string[],
  runDir: ResolvedRunDir | undefined
): string {
  if (command.length > 0) {
    return command.join(" ");
  }
  if (files.length === 1) {
    return basename(files[0] ?? "logs");
  }
  if (runDir !== undefined) {
    return runDir.runId;
  }
  return "Botlog";
}

function resolveRunDir(path: string): ResolvedRunDir {
  const resolved = resolve(path);
  return {
    path: resolved,
    runId: basename(resolved),
    manifestPath: resolve(resolved, "botlog.json"),
    stdoutPath: resolve(resolved, "stdout.log"),
    stderrPath: resolve(resolved, "stderr.log"),
  };
}

async function readReusableManifest(runDir: ResolvedRunDir): Promise<RunManifest | undefined> {
  const manifest = await readManifest(runDir).catch(() => undefined);
  if (manifest === undefined) {
    return undefined;
  }

  const info = await fetchBotlogInfo(manifest.url).catch(() => undefined);
  if (info?.name !== "botlog" || info.runId !== manifest.runId) {
    return undefined;
  }
  return manifest;
}

async function readManifest(runDir: ResolvedRunDir): Promise<RunManifest> {
  const raw = await readFile(runDir.manifestPath, "utf8");
  return JSON.parse(raw) as RunManifest;
}

async function writeManifest(runDir: ResolvedRunDir, manifest: RunManifest): Promise<void> {
  await writeFile(runDir.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function fetchBotlogInfo(url: string): Promise<BotlogInfo> {
  const response = await fetch(new URL("/api/info", url));
  if (!response.ok) {
    throw new Error(`Botlog info request failed: ${String(response.status)}`);
  }
  return (await response.json()) as BotlogInfo;
}

function spawnCommand(command: readonly string[]) {
  const [executable, ...args] = command;
  if (executable === undefined) {
    throw new Error("Expected a command to spawn");
  }
  return spawn(executable, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
}

interface RedactingWriter {
  write(chunk: Buffer | string): void;
  close(): Promise<void>;
}

function createRunLogWriters(
  runDir: ResolvedRunDir,
  redactors: readonly Redactor[]
): {
  readonly stdout: RedactingWriter;
  readonly stderr: RedactingWriter;
} {
  return {
    stdout: createRedactingWriter(runDir.stdoutPath, redactors),
    stderr: createRedactingWriter(runDir.stderrPath, redactors),
  };
}

function createRedactingWriter(path: string, redactors: readonly Redactor[]): RedactingWriter {
  const writer = createWriteStream(path, { flags: "a" });
  let buffer = "";

  return {
    write(chunk: Buffer | string) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        writer.write(`${redactLine(line, redactors)}\n`);
      }
    },
    close() {
      if (buffer.length > 0) {
        writer.write(redactLine(buffer, redactors));
        buffer = "";
      }
      return closeWriter(writer);
    },
  };
}

function teeReadable(
  readable: NodeJS.ReadableStream | null,
  terminal: Writable | undefined,
  file: RedactingWriter
): void {
  readable?.on("data", (chunk: Buffer | string) => {
    terminal?.write(chunk);
    file.write(chunk);
  });
}

function trackChild(child: ReturnType<typeof spawnCommand>): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (code: number | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(code);
    };

    child.once("error", (error) => {
      console.error(error.message);
      settle(1);
    });
    child.once("exit", (code) => {
      settle(code);
    });
  });
}

function closeWriters(
  writers: { readonly stdout: RedactingWriter; readonly stderr: RedactingWriter } | undefined
): Promise<void> {
  if (writers === undefined) {
    return Promise.resolve();
  }
  return Promise.all([writers.stdout.close(), writers.stderr.close()]).then(() => undefined);
}

function closeWriter(writer: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    writer.end((error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function printReady(event: ReadyEvent, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(event));
    return;
  }
  console.log(`Botlog listening at ${event.url}${event.reused ? " (reused)" : ""}`);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.unref();
}

async function waitForShutdown(server: { close(): Promise<void> }): Promise<void> {
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await server.close();
}

function isMain(): boolean {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMain()) {
  runCli().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  );
}
