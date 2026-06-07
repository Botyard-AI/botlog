import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import { renderUi } from "../src/ui.js";

describe("renderUi", () => {
  it("renders browser-parseable inline JavaScript", () => {
    const html = renderUi("Test");
    const scripts = extractScripts(html);

    expect(scripts).toHaveLength(1);
    expect(() => new Script(scripts[0] ?? "")).not.toThrow();
  });

  it("escapes the title in the document", () => {
    const html = renderUi('<script>alert("x")</script>');

    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain('<h1><script>alert("x")</script></h1>');
  });

  it("includes polling fallback and entry deduplication", () => {
    const script = extractScripts(renderUi("Test"))[0] ?? "";

    expect(script).toContain("seenEntryIds");
    expect(script).toContain("setInterval");
    expect(script).toContain("/api/state");
    expect(script).toContain("polling fallback");
  });

  it("uses textContent for log messages", () => {
    const script = extractScripts(renderUi("Test"))[0] ?? "";

    expect(script).toContain("row.children[2].textContent = entry.text");
    expect(script).not.toContain("entry.text +");
  });
});

function extractScripts(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1] ?? "");
}
