import { describe, expect, it } from "vitest";

import { createApp, LogStore } from "../src/index.js";

describe("server", () => {
  it("serves health", async () => {
    const app = createApp({ store: new LogStore({ title: "test", maxEntries: 10 }) });

    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("serves botlog identity info", async () => {
    const app = createApp({
      store: new LogStore({ title: "test", maxEntries: 10 }),
      info: {
        name: "botlog",
        runId: "ci",
        title: "test",
        startedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    const response = await app.request("/api/info");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      name: "botlog",
      runId: "ci",
      title: "test",
      startedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("serves state", async () => {
    const store = new LogStore({ title: "test", maxEntries: 10 });
    store.ensureStream("example", "example");
    store.append("example", "info", "hello");
    const app = createApp({ store });

    const response = await app.request("/api/state");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ title: "test" });
  });

  it("serves the HTML UI with escaped title", async () => {
    const store = new LogStore({ title: "<Botlog>", maxEntries: 10 });
    const app = createApp({ store });

    const response = await app.request("/");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("&lt;Botlog&gt;");
    expect(html).not.toContain("<h1><Botlog></h1>");
  });

  it("streams entry events over SSE", async () => {
    const store = new LogStore({ title: "test", maxEntries: 10 });
    store.ensureStream("example", "example");
    const app = createApp({ store });

    const responsePromise = app.request("/events");
    await new Promise((resolve) => setTimeout(resolve, 10));
    store.append("example", "info", "hello");
    const response = await responsePromise;
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("Expected SSE response body to be readable");
    }

    const text = await readUntil(reader, "hello");
    await reader.cancel();

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(text).toContain("event: ready");
    expect(text).toContain("event: entry");
    expect(text).toContain('"text":"hello"');
  });
});

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  needle: string
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const startedAt = Date.now();
  while (!text.includes(needle)) {
    if (Date.now() - startedAt > 1_000) {
      throw new Error(`Timed out waiting for ${needle}. Read: ${text}`);
    }
    const result = await reader.read();
    if (result.done) {
      break;
    }
    text += decoder.decode(result.value, { stream: true });
  }
  return text;
}
