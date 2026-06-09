import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCliArgs, runCli } from "../src/cli.js";

describe("cli", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.map((path) => rm(path, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("parses command and bot-friendly options", () => {
    const options = parseCliArgs([
      "--json",
      "--port",
      "0",
      "--title",
      "CI logs",
      "--file",
      "api.log",
      "--file",
      "worker.log",
      "--run-dir",
      ".botlog/runs/ci",
      "--",
      "pnpm",
      "ci",
    ]);

    expect(options.json).toBe(true);
    expect(options.port).toBe(0);
    expect(options.title).toBe("CI logs");
    expect(options.files).toEqual(["api.log", "worker.log"]);
    expect(options.runDir).toBe(".botlog/runs/ci");
    expect(options.command).toEqual(["pnpm", "ci"]);
  });

  it("rejects unknown options", () => {
    expect(() => parseCliArgs(["--wat"])).toThrow("Unknown option: --wat");
  });

  it("wraps a command and prints a JSON ready event", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });

    const code = await runCli([
      "--json",
      "--port",
      "0",
      "--title",
      "node smoke",
      "--",
      process.execPath,
      "-e",
      "console.log('hello from child')",
    ]);

    expect(code).toBe(0);
    const ready = JSON.parse(logs[0] ?? "") as { event: string; port: number; title: string };
    expect(ready).toMatchObject({ event: "ready", title: "node smoke" });
    expect(ready.port).toBeGreaterThan(0);
  });

  it("does not hang when a wrapped command exits immediately", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const code = await runCli(["--json", "--port", "0", "--", process.execPath, "-e", ""]);

    expect(code).toBe(0);
  });

  it("returns a failed exit code for missing executables", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });

    const code = await runCli(["--json", "--port", "0", "--", "botlog-missing-executable"]);

    expect(code).toBe(1);
    expect(errors.join("\n")).toContain("botlog-missing-executable");
  });

  it("writes run-dir manifests and command stdout/stderr logs", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "botlog-cli-"));
    tempDirs.push(runDir);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });

    const code = await runCli([
      "--json",
      "--port",
      "0",
      "--run-dir",
      runDir,
      "--",
      process.execPath,
      "-e",
      "console.log('stdout line'); console.error('stderr line')",
    ]);

    expect(code).toBe(0);
    const ready = JSON.parse(logs[0] ?? "") as { runDir: string; runId: string; port: number };
    expect(ready.runDir).toBe(runDir);
    expect(ready.runId).toBe(runDir.split(/[/\\]/).at(-1));
    expect(ready.port).toBeGreaterThan(0);

    const manifest = JSON.parse(await readFile(join(runDir, "botlog.json"), "utf8")) as {
      runId: string;
      url: string;
      files: { stdout: string; stderr: string };
    };
    expect(manifest.runId).toBe(ready.runId);
    expect(manifest.url).toContain(`:${String(ready.port)}`);
    await expect(readFile(manifest.files.stdout, "utf8")).resolves.toContain("stdout line");
    await expect(readFile(manifest.files.stderr, "utf8")).resolves.toContain("stderr line");
  });

  it("redacts run-dir stdout and stderr logs", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "botlog-cli-redact-"));
    tempDirs.push(runDir);
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });

    const code = await runCli([
      "--json",
      "--port",
      "0",
      "--run-dir",
      runDir,
      "--redact",
      "SECRET-[0-9]+",
      "--",
      process.execPath,
      "-e",
      "console.log('token SECRET-123'); console.error('err SECRET-456')",
    ]);

    expect(code).toBe(0);
    const ready = JSON.parse(logs[0] ?? "") as { title: string };
    expect(ready.title).toContain("[REDACTED]");
    expect(ready.title).not.toContain("SECRET-123");
    await expect(readFile(join(runDir, "stdout.log"), "utf8")).resolves.toContain(
      "token [REDACTED]"
    );
    await expect(readFile(join(runDir, "stdout.log"), "utf8")).resolves.not.toContain("SECRET-123");
    await expect(readFile(join(runDir, "stderr.log"), "utf8")).resolves.toContain("err [REDACTED]");
    await expect(readFile(join(runDir, "stderr.log"), "utf8")).resolves.not.toContain("SECRET-456");
  });
});
