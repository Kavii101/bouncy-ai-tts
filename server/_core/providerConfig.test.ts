import { describe, expect, it } from "vitest";
import {
  OPENAI_DEFAULT_CHAT_MODEL,
  audioExtensionFor,
  isOpenAiUrl,
  providerEndpoint,
  resolveChatModel,
  resolveTranscriptionModel,
} from "./providerConfig";

describe("isOpenAiUrl", () => {
  it("matches only the OpenAI API host", () => {
    expect(isOpenAiUrl("https://api.openai.com")).toBe(true);
    expect(isOpenAiUrl("https://api.openai.com/")).toBe(true);
    expect(isOpenAiUrl("https://forge.manus.im")).toBe(false);
    expect(isOpenAiUrl("https://api.openai.com.evil.example")).toBe(false);
    expect(isOpenAiUrl("")).toBe(false);
  });
});

describe("resolveChatModel", () => {
  it("prefers the per-call model", () => {
    expect(resolveChatModel({ requested: "gpt-x", envModel: "env-m", apiUrl: "https://api.openai.com" })).toBe("gpt-x");
  });
  it("falls back to LLM_MODEL", () => {
    expect(resolveChatModel({ requested: " ", envModel: "env-m", apiUrl: "https://forge.manus.im" })).toBe("env-m");
  });
  it("defaults only for OpenAI", () => {
    expect(resolveChatModel({ apiUrl: "https://api.openai.com" })).toBe(OPENAI_DEFAULT_CHAT_MODEL);
    expect(resolveChatModel({ apiUrl: "https://forge.manus.im" })).toBeUndefined();
  });
});

describe("resolveTranscriptionModel", () => {
  it("defaults to whisper-1 and honours overrides", () => {
    expect(resolveTranscriptionModel()).toBe("whisper-1");
    expect(resolveTranscriptionModel("  ")).toBe("whisper-1");
    expect(resolveTranscriptionModel("gpt-4o-transcribe")).toBe("gpt-4o-transcribe");
  });
});

describe("audioExtensionFor", () => {
  it("strips codec parameters", () => {
    expect(audioExtensionFor("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExtensionFor("Audio/MP4")).toBe("m4a");
    expect(audioExtensionFor("audio/ogg; codecs=opus")).toBe("ogg");
  });
  it("rejects unknown types", () => {
    expect(audioExtensionFor("application/octet-stream")).toBeUndefined();
    expect(audioExtensionFor("")).toBeUndefined();
  });
});

describe("providerEndpoint", () => {
  it("joins without double slashes", () => {
    expect(providerEndpoint("https://api.openai.com/", "/v1/audio/transcriptions")).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
    expect(providerEndpoint("https://x.test", "v1/chat/completions")).toBe("https://x.test/v1/chat/completions");
  });
});
