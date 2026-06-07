import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { Botlog } from "../src/index.js";
import type { AttachableProcess } from "../src/index.js";

class FakeProcess extends EventEmitter implements AttachableProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();

  finish(code: number | null): void {
    this.stdout.end();
    this.stderr.end();
    this.emit("exit", code);
  }

  exitBeforePipesClose(code: number | null): void {
    this.emit("exit", code);
  }
}

describe("Botlog", () => {
  it("records manual stream lines and redacts secrets", () => {
    const botlog = new Botlog({ title: "manual", redact: ["secret-value"] });
    const stream = botlog.createStream("manual stream");

    stream.info("hello");
    stream.error("secret-value");
    stream.end("completed", 0);

    const snapshot = botlog.snapshot();
    expect(snapshot.title).toBe("manual");
    expect(snapshot.streams).toMatchObject([
      { name: "manual stream", status: "completed", exitCode: 0 },
    ]);
    expect(snapshot.entries.map((entry) => ({ level: entry.level, text: entry.text }))).toEqual([
      { level: "info", text: "hello" },
      { level: "error", text: "[REDACTED]" },
    ]);
  });

  it("creates distinct stream ids when names slugify to the same value", () => {
    const botlog = new Botlog({ title: "manual" });

    const first = botlog.createStream("build (1)");
    const second = botlog.createStream("build-1");

    expect(first.id).toBe("build-1");
    expect(second.id).toBe("build-1-2");
  });

  it("preserves blank log lines", () => {
    const botlog = new Botlog({ title: "manual" });
    const stream = botlog.createStream("manual stream");

    stream.info("before\n\nafter");

    expect(botlog.snapshot().entries.map((entry) => entry.text)).toEqual(["before", "", "after"]);
  });

  it("attaches child stdout and stderr, flushes partial lines, and marks success", async () => {
    const botlog = new Botlog({ title: "process" });
    const child = new FakeProcess();

    botlog.attachProcess("pnpm test", child);
    child.stdout.write("out one\nout two partial");
    child.stderr.write("err one\n");
    child.finish(0);
    await waitFor(
      () =>
        botlog.snapshot().streams[0]?.status === "completed" &&
        botlog.snapshot().entries.some((entry) => entry.text === "out two partial")
    );

    const snapshot = botlog.snapshot();
    expect(snapshot.streams[0]).toMatchObject({
      name: "pnpm test",
      status: "completed",
      exitCode: 0,
    });
    expect(snapshot.entries.map((entry) => ({ level: entry.level, text: entry.text }))).toEqual([
      { level: "info", text: "out one" },
      { level: "error", text: "err one" },
      { level: "info", text: "out two partial" },
    ]);
  });

  it("waits for stdout and stderr to end before marking a process completed", async () => {
    const botlog = new Botlog({ title: "process" });
    const child = new FakeProcess();

    botlog.attachProcess("racy command", child);
    child.stdout.write("final partial");
    child.exitBeforePipesClose(0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(botlog.snapshot().streams[0]?.status).toBe("running");

    child.stdout.end();
    child.stderr.end();
    await waitFor(() => botlog.snapshot().streams[0]?.status === "completed");

    expect(botlog.snapshot().entries.map((entry) => entry.text)).toContain("final partial");
  });

  it("marks failed child processes", async () => {
    const botlog = new Botlog({ title: "process" });
    const child = new FakeProcess();

    botlog.attachProcess("failing command", child);
    child.finish(1);
    await waitFor(() => botlog.snapshot().streams[0]?.status === "failed");

    expect(botlog.snapshot().streams[0]).toMatchObject({ status: "failed", exitCode: 1 });
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
