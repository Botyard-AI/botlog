import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCliArgs, runCli } from "../src/cli.js";
import { Botlog } from "../src/index.js";

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
    const ready = JSON.parse(logs[0] ?? "") as {
      runDir: string;
      runId: string;
      port: number;
      manifestPath: string;
      stdoutPath: string;
      stderrPath: string;
    };
    expect(ready.runDir).toBe(runDir);
    expect(ready.runId).toBe(runDir.split(/[/\\]/).at(-1));
    expect(ready.manifestPath).toBe(join(runDir, "botlog.json"));
    expect(ready.stdoutPath).toBe(join(runDir, "stdout.log"));
    expect(ready.stderrPath).toBe(join(runDir, "stderr.log"));
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

  it("includes run-dir file paths in reused ready events", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "botlog-cli-reuse-"));
    tempDirs.push(runDir);
    const runId = runDir.split(/[/\\]/).at(-1) ?? "run";
    const botlog = new Botlog({ title: "reused run", runId });
    const server = botlog.listen({ port: 0 });
    const port = await waitForPort(server);
    const manifestPath = join(runDir, "botlog.json");
    const stdoutPath = join(runDir, "stdout.log");
    const stderrPath = join(runDir, "stderr.log");
    await writeFile(stdoutPath, "previous stdout\n");
    await writeFile(stderrPath, "previous stderr\n");
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          runId,
          title: "reused run",
          host: "127.0.0.1",
          port,
          url: `http://127.0.0.1:${String(port)}`,
          serverPid: process.pid,
          startedAt: new Date().toISOString(),
          files: { stdout: stdoutPath, stderr: stderrPath, attached: [] },
        },
        null,
        2
      )}\n`
    );

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });

    try {
      const code = await runCli(["--json", "--run-dir", runDir]);

      expect(code).toBe(0);
      const ready = JSON.parse(logs[0] ?? "") as {
        reused: boolean;
        manifestPath: string;
        stdoutPath: string;
        stderrPath: string;
      };
      expect(ready.reused).toBe(true);
      expect(ready.manifestPath).toBe(manifestPath);
      expect(ready.stdoutPath).toBe(stdoutPath);
      expect(ready.stderrPath).toBe(stderrPath);
    } finally {
      await server.close();
    }
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

async function waitForPort(server: { readonly port: number }): Promise<number> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.port !== 0) {
      return server.port;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return server.port;
}
