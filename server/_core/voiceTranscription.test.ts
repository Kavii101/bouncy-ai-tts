import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let transcribeBytes: typeof import("./voiceTranscription").transcribeBytes;

beforeAll(async () => {
  process.env.BUILT_IN_FORGE_API_URL = "https://api.openai.com/";
  process.env.BUILT_IN_FORGE_API_KEY = "sk-test";
  vi.resetModules();
  ({ transcribeBytes } = await import("./voiceTranscription"));
});

afterEach(() => vi.unstubAllGlobals());

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("transcribeBytes", () => {
  it("POSTs the bytes directly to /v1/audio/transcriptions with a real filename and model", async () => {
    const fetchMock = vi.fn(async () => okResponse({ text: "hello", language: "english", duration: 1.2, segments: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeBytes(Buffer.from("fake-webm"), "audio/webm;codecs=opus", { language: "en" });

    expect(result).toMatchObject({ text: "hello", language: "english", duration: 1.2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const form = init.body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe("audio.webm");
    expect(file.type).toBe("audio/webm");
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("response_format")).toBe("verbose_json");
    expect(form.get("language")).toBe("en");
  });

  it("treats silence (empty text) as a valid result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse({ text: "" })));
    const result = await transcribeBytes(Buffer.from("x"), "audio/ogg");
    expect(result).toMatchObject({ text: "", segments: [] });
  });

  it("rejects unsupported formats and oversize audio without calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await transcribeBytes(Buffer.from("x"), "application/octet-stream")).toMatchObject({ code: "INVALID_FORMAT" });
    expect(await transcribeBytes(Buffer.alloc(16 * 1024 * 1024 + 1), "audio/webm")).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces provider errors as TRANSCRIPTION_FAILED", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad file", { status: 400, statusText: "Bad Request" })));
    const result = await transcribeBytes(Buffer.from("x"), "audio/webm");
    expect(result).toMatchObject({ code: "TRANSCRIPTION_FAILED" });
  });
});
