import { describe, expect, it } from "vitest";
import { canConsumeQuota, createTtsLogPayload, hashText, isTransientProviderError, makeIdempotencyKey, makeObjectKey, normalizeTtsText, synthesizeWithFailover, validateTtsRequest, type TtsProvider } from "./tts";

describe("TTS text safety and normalization", () => {
  it("normalizes whitespace, unicode, and markup without losing BI punctuation", () => {
    const result = normalizeTtsText("  Revenue grew 18%  month over month to $128,400. <b>Retention</b> reached 94.2% in Q2 2026.  ");
    expect(result).toBe("Revenue grew 18% month over month to $128,400. Retention reached 94.2% in Q2 2026.");
  });
  it("rejects empty text", () => { expect(() => validateTtsRequest({ text: "   ", languageCode: "en-US", voiceId: "Charon", speed: 1 })).toThrow("TEXT_EMPTY"); });
  it("accepts supported text and settings", () => { expect(validateTtsRequest({ text: "Profit increased by 12.5% to $9,400 on 2026-08-28.", languageCode: "en-US", voiceId: "Charon", speed: 1 }).text).toContain("$9,400"); });
  it("rejects unsupported settings", () => { expect(() => validateTtsRequest({ text: "Hello", languageCode: "xx-XX", voiceId: "Charon", speed: 1 })).toThrow("LANGUAGE_UNSUPPORTED"); expect(() => validateTtsRequest({ text: "Hello", languageCode: "en-US", voiceId: "Charon", speed: 2 })).toThrow("SPEED_UNSUPPORTED"); });
});

describe("TTS quota and provider behavior", () => {   it("rejects quota consumption beyond the workspace limit", () => { expect(canConsumeQuota(95, 6, 100)).toBe(false); expect(canConsumeQuota(94, 6, 100)).toBe(true); });   it("classifies transient provider failures for retry/failover", () => { expect(isTransientProviderError({ status: 503 })).toBe(true); expect(isTransientProviderError({ status: 429 })).toBe(true); expect(isTransientProviderError({ status: 400 })).toBe(false); }); });  describe("TTS artifact identity", () => {
  it("creates a workspace-scoped safe key", () => { const key = makeObjectKey("workspace/../../private", "123e4567-e89b-12d3-a456-426614174000"); expect(key).toBe("tts/workspace_______private/123e4567-e89b-12d3-a456-426614174000.mp3"); expect(key).not.toContain(".."); });
  it("hashes text deterministically without storing it in the key", () => { expect(hashText("same")).toBe(hashText("same")); expect(hashText("same")).not.toBe(hashText("different")); });
});

describe("TTS integration primitives", () => {
  it("scopes idempotency keys by workspace", () => {
    expect(makeIdempotencyKey("workspace-a", "same")).not.toBe(makeIdempotencyKey("workspace-b", "same"));
  });
  it("redacts raw text from structured log payloads", () => {
    const payload = createTtsLogPayload("job_started", { text: "secret revenue", rawText: "secret revenue", charCount: 15 });
    expect(payload).not.toHaveProperty("text");
    expect(payload).not.toHaveProperty("rawText");
    expect(payload.charCount).toBe(15);
  });
  it("retries transient primary failure and fails over to secondary", async () => {
    let attempts = 0;
    const primary: TtsProvider = { name: "primary", synthesize: async () => { attempts += 1; const error = new Error("temporary"); (error as Error & { status?: number }).status = 503; throw error; } };
    const secondary: TtsProvider = { name: "secondary", synthesize: async () => ({ data: Buffer.from("audio"), mimeType: "audio/mpeg" }) };
    const result = await synthesizeWithFailover({ text: "Hello", languageCode: "en-US", voiceId: "Charon", speed: 1 }, undefined, [primary, secondary]);
    expect(result.provider).toBe("secondary");
    expect(attempts).toBe(2);
  });
});
