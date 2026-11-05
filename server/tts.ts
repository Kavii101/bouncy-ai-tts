import crypto from "node:crypto";
import { ENV } from "./_core/env";
import { isOpenAiUrl, providerEndpoint } from "./_core/providerConfig";

export const TTS_LANGUAGES = ["en-US", "en-GB", "en-IN", "fr-FR", "es-ES", "de-DE"] as const;
export const TTS_VOICES = [
  { id: "Aoede", label: "Aoede · Natural and warm (recommended)", languages: TTS_LANGUAGES },
  { id: "Achird", label: "Achird · Friendly", languages: TTS_LANGUAGES },
  { id: "Charon", label: "Charon · Informative", languages: TTS_LANGUAGES },
  { id: "Kore", label: "Kore · Firm", languages: TTS_LANGUAGES },
] as const;
export const TTS_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
export const MAX_TTS_CHARS = Number(process.env.TTS_MAX_CHARS ?? 5000);
export const DEFAULT_RETENTION_HOURS = Number(process.env.TTS_RETENTION_HOURS ?? 24);

export type TtsSourceType = "insight" | "report" | "user_text";
export type TtsRequest = {
  text: string;
  languageCode: string;
  voiceId: string;
  speed: number;
};
export type AudioArtifact = { data: Buffer; mimeType: string; durationMs?: number; providerRequestId?: string };
export type TtsProvider = { name: string; synthesize(request: TtsRequest, signal?: AbortSignal): Promise<AudioArtifact> };

export function normalizeTtsText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateTtsRequest(request: TtsRequest) {
  const text = normalizeTtsText(request.text);
  if (!text) throw new Error("TEXT_EMPTY");
  if (text.length > MAX_TTS_CHARS) throw new Error("TEXT_TOO_LONG");
  if (!(TTS_LANGUAGES as readonly string[]).includes(request.languageCode)) throw new Error("LANGUAGE_UNSUPPORTED");
  const voice = TTS_VOICES.find(item => item.id === request.voiceId);
  if (!voice || !voice.languages.includes(request.languageCode as never)) throw new Error("VOICE_UNSUPPORTED");
  if (!TTS_SPEEDS.includes(request.speed as never)) throw new Error("SPEED_UNSUPPORTED");
  return { ...request, text };
}

export function hashText(text: string) { return crypto.createHash("sha256").update(text).digest("hex"); }
export function makeObjectKey(workspaceId: string, jobId: string) {
  const safeWorkspace = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `tts/${safeWorkspace}/${jobId}.mp3`;
}

// The UI's voice ids are provider-neutral; OpenAI only accepts its own names.
export const OPENAI_VOICE_BY_ID: Record<string, string> = { Aoede: "coral", Achird: "alloy", Charon: "onyx", Kore: "sage" };

class HttpTtsProvider implements TtsProvider {
  constructor(public readonly name: string, private readonly baseUrl: string, private readonly apiKey: string, private readonly model: string) {}
  async synthesize(request: TtsRequest, signal?: AbortSignal): Promise<AudioArtifact> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/audio/speech`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: request.text, voice: isOpenAiUrl(this.baseUrl) ? OPENAI_VOICE_BY_ID[request.voiceId] ?? request.voiceId : request.voiceId, speed: request.speed, response_format: "mp3" }),
    });
    if (!response.ok) {
      const error = new Error(`PROVIDER_${response.status}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    return { data: Buffer.from(await response.arrayBuffer()), mimeType: "audio/mpeg", providerRequestId: response.headers.get("x-request-id") ?? undefined };
  }
}

export function configuredProviders(): TtsProvider[] {
  const providers: TtsProvider[] = [];
  const primaryUrl = process.env.TTS_PRIMARY_BASE_URL;
  const primaryKey = process.env.TTS_PRIMARY_API_KEY;
  const secondaryUrl = process.env.TTS_SECONDARY_BASE_URL;
  const secondaryKey = process.env.TTS_SECONDARY_API_KEY;
  if (primaryUrl && primaryKey) providers.push(new HttpTtsProvider("primary", primaryUrl, primaryKey, process.env.TTS_PRIMARY_MODEL ?? "tts-1"));
  if (secondaryUrl && secondaryKey) providers.push(new HttpTtsProvider("secondary", secondaryUrl, secondaryKey, process.env.TTS_SECONDARY_MODEL ?? "tts-1"));
  // No dedicated TTS provider: reuse the chat provider when it is plain OpenAI.
  // (Manus Forge has no /audio/speech, so it is not assumed here.)
  if (!providers.length && ENV.forgeApiKey && isOpenAiUrl(ENV.forgeApiUrl)) {
    providers.push(new HttpTtsProvider("primary", providerEndpoint(ENV.forgeApiUrl, "v1"), ENV.forgeApiKey, process.env.TTS_PRIMARY_MODEL ?? "tts-1"));
  }
  return providers;
}

export function isTransientProviderError(error: unknown) {
  const status = (error as { status?: number })?.status;
  return !status || status === 408 || status === 409 || status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function synthesizeWithFailover(request: TtsRequest, signal?: AbortSignal, providerOverrides?: TtsProvider[]) {   const providers = providerOverrides ?? configuredProviders();
  if (!providers.length) throw new Error("TTS_PROVIDER_NOT_CONFIGURED");
  let lastError: unknown;
  for (const provider of providers) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) throw new Error("TTS_CANCELLED");
      try { return { ...await provider.synthesize(request, signal), provider: provider.name }; }
      catch (error) { lastError = error; if (!isTransientProviderError(error)) break; if (attempt === 0) await sleep(150 * 2 ** attempt); }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("TTS_PROVIDER_FAILED");
}

export function canConsumeQuota(current: number, requested: number, limit: number) { return requested >= 0 && current >= 0 && limit >= 0 && current + requested <= limit; } export function isArtifactExpired(expiresAt: Date, now = new Date()) { return expiresAt.getTime() <= now.getTime(); } export function isTerminalTtsStatus(status: string) { return ["ready", "failed", "cancelled", "expired"].includes(status); } export function makeIdempotencyKey(workspaceId: string, key: string) { return `${workspaceId}:${key}`; } export function createTtsLogPayload(event: string, data: Record<string, unknown>) { const safe = { ...data }; delete safe.text; delete safe.rawText; return { scope: "tts", event, at: new Date().toISOString(), ...safe }; }

export function errorCode(error: unknown) {
  const code = error instanceof Error ? error.message : "TTS_FAILED";
  return ["TEXT_EMPTY", "TEXT_TOO_LONG", "LANGUAGE_UNSUPPORTED", "VOICE_UNSUPPORTED", "SPEED_UNSUPPORTED", "TTS_CANCELLED", "TTS_PROVIDER_NOT_CONFIGURED"].includes(code) ? code : "TTS_PROVIDER_FAILED";
}

export function validateTranscriptionInput(byteLength: number, mimeType: string, language?: string) {   if (byteLength <= 0) throw new Error("VOICE_EMPTY");   if (byteLength > 16 * 1024 * 1024) throw new Error("VOICE_FILE_TOO_LARGE");   if (!["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"].includes(mimeType)) throw new Error("VOICE_FORMAT_UNSUPPORTED");   if (language && !/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) throw new Error("VOICE_LANGUAGE_INVALID");   return true; }  export const publicTtsConfig = {
  languages: TTS_LANGUAGES,
  voices: TTS_VOICES.map(({ id, label }) => ({ id, label })),
  speeds: TTS_SPEEDS,
  maxChars: MAX_TTS_CHARS,
  retentionHours: DEFAULT_RETENTION_HOURS,
};

void ENV;
