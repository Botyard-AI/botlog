import { describe, expect, it } from "vitest";

import { Botlog, redactLine } from "../src/index.js";

describe("redactLine", () => {
  it("redacts bearer tokens", () => {
    expect(redactLine("Authorization: Bearer abc123")).toBe("Authorization: [REDACTED]");
  });

  it("redacts common assignment-style secrets", () => {
    expect(redactLine("api_key=abc123")).toBe("api_key=[REDACTED]");
    expect(redactLine("token: abc123")).toBe("token: [REDACTED]");
    expect(redactLine("password = abc123")).toBe("password = [REDACTED]");
  });

  it("applies custom string, regex, and function redactors", () => {
    expect(redactLine("hello secret", ["secret"])).toBe("hello [REDACTED]");
    expect(redactLine("hello user-123", [/user-\d+/g])).toBe("hello [REDACTED]");
    expect(redactLine("hello world", [(line) => line.toUpperCase()])).toBe("HELLO WORLD");
  });

  it("redacts lines written through Botlog streams", () => {
    const botlog = new Botlog({ redact: [/secret-\d+/g] });
    const stream = botlog.createStream("secure");

    stream.write("value secret-123");

    expect(botlog.snapshot().entries[0]?.text).toBe("value [REDACTED]");
  });
});
