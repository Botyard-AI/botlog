import { describe, expect, it } from "vitest";

import { redactLine } from "../src/index.js";

describe("redactLine", () => {
  it("redacts bearer tokens", () => {
    expect(redactLine("Authorization: Bearer secret-token")).toBe("Authorization: [REDACTED]");
  });

  it("applies custom string redactors", () => {
    expect(redactLine("hello secret", ["secret"])).toBe("hello [REDACTED]");
  });
});
