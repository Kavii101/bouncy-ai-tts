import { describe, expect, it } from "vitest";
import { redact } from "./redaction";

describe("redaction", () => {
  it("drops content-bearing keys at any depth", () => {
    const out = redact({
      workspaceId: "ws",
      charCount: 10,
      text: "secret resume text",
      nested: { answer: "my private answer", category: "behavioral" },
      items: [{ claim: "a metric", verified: true }],
    }) as Record<string, any>;

    expect(out.workspaceId).toBe("ws");
    expect(out.charCount).toBe(10);
    expect(out.text).toBe("[redacted]");
    expect(out.nested.answer).toBe("[redacted]");
    expect(out.nested.category).toBe("behavioral");
    expect(out.items[0].claim).toBe("[redacted]");
    expect(out.items[0].verified).toBe(true);
  });

  it("is case-insensitive on key names", () => {
    const out = redact({ RawText: "x", Prompt: "y" }) as Record<string, string>;
    expect(out.RawText).toBe("[redacted]");
    expect(out.Prompt).toBe("[redacted]");
  });

  it("leaves primitives and safe metadata untouched", () => {
    expect(redact("hello")).toBe("hello");
    expect(redact(42)).toBe(42);
    expect(redact({ latencyMs: 12, model: "m" })).toEqual({ latencyMs: 12, model: "m" });
  });
});
