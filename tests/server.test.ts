import { describe, expect, it } from "vitest";

import { createApp, LogStore } from "../src/index.js";

describe("server", () => {
  it("serves health", async () => {
    const app = createApp({ store: new LogStore({ title: "test", maxEntries: 10 }) });

    const response = await app.request("/healthz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
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
});
