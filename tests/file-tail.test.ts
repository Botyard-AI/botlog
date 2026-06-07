import { mkdtemp, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { Botlog } from "../src/index.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("file attachments", () => {
  it("tails multiple files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "botlog-"));
    tempDirs.push(dir);
    const first = join(dir, "first.log");
    const second = join(dir, "second.log");
    await writeFile(first, "first old\n");
    await writeFile(second, "second old\n");
    const botlog = new Botlog({ title: "files" });

    const attached = await botlog.attachFiles([first, second], { pollIntervalMs: 20 });
    await appendFile(first, "first new\n");
    await appendFile(second, "second new\n");
    await waitFor(() => botlog.snapshot().entries.length >= 2);

    expect(attached).toHaveLength(2);
    expect(botlog.snapshot().entries.map((entry) => entry.text)).toEqual(
      expect.arrayContaining(["first new", "second new"])
    );

    for (const file of attached) {
      file.close();
    }
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
