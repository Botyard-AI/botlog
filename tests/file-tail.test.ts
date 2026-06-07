import { appendFile, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { Botlog } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("file attachments", () => {
  it("tails multiple files without reading existing content by default", async () => {
    const { first, second } = await createLogFiles();
    const botlog = new Botlog({ title: "files" });

    const attached = await botlog.attachFiles([first, second], { pollIntervalMs: 20 });
    await appendFile(first, "first new\n");
    await appendFile(second, "second new\n");
    await waitFor(() => botlog.snapshot().entries.length >= 2);

    expect(attached).toHaveLength(2);
    expect(botlog.snapshot().entries.map((entry) => entry.text)).toEqual(
      expect.arrayContaining(["first new", "second new"])
    );
    expect(botlog.snapshot().entries.map((entry) => entry.text)).not.toContain("first old");
    expect(botlog.snapshot().entries.map((entry) => entry.text)).not.toContain("second old");

    for (const file of attached) {
      file.close();
    }
  });

  it("can read from the beginning", async () => {
    const { first } = await createLogFiles();
    const botlog = new Botlog({ title: "files" });

    const attached = await botlog.attachFile(first, { fromBeginning: true, pollIntervalMs: 20 });

    expect(botlog.snapshot().entries.map((entry) => entry.text)).toContain("first old");
    attached.close();
  });

  it("buffers partial lines until newline or close", async () => {
    const { first } = await createLogFiles();
    const botlog = new Botlog({ title: "files" });

    const attached = await botlog.attachFile(first, { pollIntervalMs: 20 });
    await appendFile(first, "partial");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(botlog.snapshot().entries.map((entry) => entry.text)).not.toContain("partial");

    await appendFile(first, " line\n");
    await waitFor(() => botlog.snapshot().entries.some((entry) => entry.text === "partial line"));
    attached.close();
  });

  it("flushes a partial line on close and stops ingesting", async () => {
    const { first } = await createLogFiles();
    const botlog = new Botlog({ title: "files" });

    const attached = await botlog.attachFile(first, { pollIntervalMs: 20 });
    await appendFile(first, "final partial");
    await new Promise((resolve) => setTimeout(resolve, 60));
    attached.close();
    await appendFile(first, " ignored\n");
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(botlog.snapshot().entries.map((entry) => entry.text)).toContain("final partial");
    expect(botlog.snapshot().entries.map((entry) => entry.text)).not.toContain(" ignored");
  });

  it("resets when a file is truncated", async () => {
    const { first } = await createLogFiles();
    const botlog = new Botlog({ title: "files" });

    const attached = await botlog.attachFile(first, { pollIntervalMs: 20 });
    await truncate(first, 0);
    await appendFile(first, "after truncate\n");
    await waitFor(() => botlog.snapshot().entries.some((entry) => entry.text === "after truncate"));

    attached.close();
  });

  it("does not duplicate lines when fs.watch and polling both fire", async () => {
    const { first } = await createLogFiles();
    const botlog = new Botlog({ title: "files" });

    const attached = await botlog.attachFile(first, { pollIntervalMs: 5 });
    await appendFile(first, "exactly once\n");
    await waitFor(() => botlog.snapshot().entries.some((entry) => entry.text === "exactly once"));
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(botlog.snapshot().entries.filter((entry) => entry.text === "exactly once")).toHaveLength(
      1
    );
    attached.close();
  });

  it("rejects missing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "botlog-"));
    tempDirs.push(dir);
    const botlog = new Botlog({ title: "files" });

    await expect(botlog.attachFile(join(dir, "missing.log"))).rejects.toThrow();
  });
});

async function createLogFiles(): Promise<{ first: string; second: string }> {
  const dir = await mkdtemp(join(tmpdir(), "botlog-"));
  tempDirs.push(dir);
  const first = join(dir, "first.log");
  const second = join(dir, "second.log");
  await writeFile(first, "first old\n");
  await writeFile(second, "second old\n");
  return { first, second };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
