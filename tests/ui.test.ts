import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import { renderUi } from "../src/ui.js";

describe("renderUi", () => {
  it("renders browser-parseable inline JavaScript", () => {
    const html = renderUi("Test");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

    expect(scripts).toHaveLength(1);
    expect(() => new Script(scripts[0] ?? "")).not.toThrow();
  });
});
