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

  it("publishes stream and entry events and supports unsubscribe", () => {
    const store = new LogStore({ title: "test", maxEntries: 10 });
    const events: string[] = [];
    const unsubscribe = store.subscribe((event) => {
      events.push(event.type);
    });

    store.ensureStream("build", "build");
    store.append("build", "info", "one");
    unsubscribe();
    store.append("build", "info", "two");

    expect(events).toEqual(["stream", "entry"]);
  });

  it("returns immutable snapshot copies", () => {
    const store = new LogStore({ title: "test", maxEntries: 10 });
    store.ensureStream("build", "build");
    const snapshot = store.snapshot();

    expect(snapshot.streams).toHaveLength(1);
    store.ensureStream("test", "test");
    expect(snapshot.streams).toHaveLength(1);
  });
});
