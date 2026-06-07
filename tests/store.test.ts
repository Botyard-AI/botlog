import { describe, expect, it } from "vitest";

import { LogStore } from "../src/index.js";

describe("LogStore", () => {
  it("keeps a bounded entry buffer", () => {
    const store = new LogStore({ title: "test", maxEntries: 2 });
    store.ensureStream("build", "build");

    store.append("build", "info", "one");
    store.append("build", "info", "two");
    store.append("build", "info", "three");

    expect(store.snapshot().entries.map((entry) => entry.text)).toEqual(["two", "three"]);
  });
});
