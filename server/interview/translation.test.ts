import { describe, expect, it } from "vitest";
import { buildTranslateMessages } from "./translation";

describe("subtitle translation prompt", () => {
  it("asks for polite Korean and only the translation", () => {
    const [system, user] = buildTranslateMessages("Nice to meet you.", "ko");
    expect(system.role).toBe("system");
    expect(system.content).toContain("Korean");
    expect(system.content).toContain("존댓말");
    expect(user.content).toBe("Translate:\nNice to meet you.");
  });

  it("includes at most the last three context lines", () => {
    const [, user] = buildTranslateMessages("Thanks.", "ko", ["a", "b", "c", "d"]);
    expect(user.content).toContain("b\nc\nd");
    expect(user.content).not.toContain("a\n");
    expect(String(user.content).endsWith("Translate:\nThanks.")).toBe(true);
  });
});
