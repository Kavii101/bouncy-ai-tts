// Pure provider-resolution helpers (no I/O) so they can be unit-tested.
//
// The app talks to an OpenAI-compatible provider at BUILT_IN_FORGE_API_URL.
// Manus Forge picks a default model when `model` is omitted; OpenAI does not
// (it returns 400 "you must provide a model parameter"). These helpers make the
// model explicit when we can tell we're talking to OpenAI, and let any deploy
// override it via env.

export const OPENAI_DEFAULT_CHAT_MODEL = "gpt-4.1-mini";
export const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";

export function isOpenAiUrl(apiUrl: string): boolean {
  try {
    return new URL(apiUrl).hostname === "api.openai.com";
  } catch {
    return false;
  }
}

/**
 * Model for a chat-completions call. Precedence: explicit per-call model →
 * LLM_MODEL env → OpenAI default (only when the base URL is api.openai.com) →
 * undefined (let the provider choose, which is Forge's behaviour).
 */
export function resolveChatModel(opts: {
  requested?: string;
  envModel?: string;
  apiUrl: string;
}): string | undefined {
  const requested = opts.requested?.trim();
  if (requested) return requested;
  const envModel = opts.envModel?.trim();
  if (envModel) return envModel;
  if (isOpenAiUrl(opts.apiUrl)) return OPENAI_DEFAULT_CHAT_MODEL;
  return undefined;
}

export function resolveTranscriptionModel(envModel?: string): string {
  return envModel?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}

const MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

/**
 * Whisper infers the container from the uploaded filename's extension, so it
 * must be a real one. Strips MIME parameters ("audio/webm;codecs=opus") and
 * returns undefined for types the transcription API won't accept.
 */
export function audioExtensionFor(mimeType: string): string | undefined {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_TO_EXT[base];
}

/** Joins a provider base URL and a path without double or missing slashes. */
export function providerEndpoint(apiUrl: string, path: string): string {
  return `${apiUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
