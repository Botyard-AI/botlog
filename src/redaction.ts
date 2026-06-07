import type { Redactor } from "./types.js";

const DEFAULT_REDACTIONS: readonly RegExp[] = [
  /Bearer\s+\S+/gi,
  /(?<prefix>api[_-]?key\s*[=:]\s*)\S+/gi,
  /(?<prefix>token\s*[=:]\s*)\S+/gi,
  /(?<prefix>password\s*[=:]\s*)\S+/gi,
];

export function redactLine(line: string, redactors: readonly Redactor[] = []): string {
  let result = line;

  for (const pattern of DEFAULT_REDACTIONS) {
    result = result.replace(pattern, (...args: unknown[]) => {
      const groups = args.at(-1) as { prefix?: string } | undefined;
      return `${groups?.prefix ?? ""}[REDACTED]`;
    });
  }

  for (const redactor of redactors) {
    if (typeof redactor === "function") {
      result = redactor(result);
    } else if (typeof redactor === "string") {
      result = result.split(redactor).join("[REDACTED]");
    } else {
      result = result.replace(redactor, "[REDACTED]");
    }
  }

  return result;
}
