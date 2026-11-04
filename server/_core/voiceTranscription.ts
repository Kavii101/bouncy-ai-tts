/**
 * Voice transcription helper using internal Speech-to-Text service
 *
 * Frontend implementation guide:
 * 1. Capture audio using MediaRecorder API
 * 2. Send the bytes to the server (base64 over tRPC)
 * 3. Server calls transcribeBytes() — direct multipart POST, no storage hop
 * 
 * Example usage:
 * ```tsx
 * // Frontend component
 * const transcribeMutation = trpc.voice.transcribe.useMutation({
 *   onSuccess: (data) => {
 *     console.log(data.text); // Full transcription
 *     console.log(data.language); // Detected language
 *     console.log(data.segments); // Timestamped segments
 *   }
 * });
 * 
 * // After uploading audio to storage
 * transcribeMutation.mutate({
 *   audioUrl: uploadedAudioUrl,
 *   language: 'en', // optional
 *   prompt: 'Transcribe the meeting' // optional
 * });
 * ```
 */
import { ENV } from "./env";
import { audioExtensionFor, providerEndpoint, resolveTranscriptionModel } from "./providerConfig";

export type TranscribeOptions = {
  audioUrl: string; // URL to the audio file (e.g., S3 URL)
  language?: string; // Optional: specify language code (e.g., "en", "es", "zh")
  prompt?: string; // Optional: custom prompt for the transcription
};

// Native Whisper API segment format
export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

// Native Whisper API response format
export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse; // Return native Whisper API response directly

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

export type TranscribeBytesOptions = {
  language?: string;
  prompt?: string;
};

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

// Known Whisper/ASR hallucination artifacts. Models like whisper-1 invent these
// training-data phrases when they hear silence, breath, or room noise (the
// classic "thanks for watching / subscribe / www….com" captions). We only drop
// a transcript when, after removing these, nothing substantive is left — so a
// real sentence that merely *contains* a URL is never discarded.
const HALLUCINATION_PATTERNS: RegExp[] = [
  /thank(s| you)?( you)? for watching/gi,
  /please (like and )?subscribe/gi,
  /don'?t forget to (like,? ?)?subscribe/gi,
  /subscribe to (our|the|my|this) channel/gi,
  /\bsubscribe\b/gi,
  /like,? comment,? and subscribe/gi,
  /see you (next time|in the next (video|one))/gi,
  /for more (information|info),?\s*(please )?visit/gi,
  /\bwww\.[^\s]+/gi,
  /https?:\/\/[^\s]+/gi,
  /\bfema\.gov\b/gi,
  /subtitles?( are)? (by|provided by|created by)/gi,
  /transcribed by/gi,
  /amara\.org/gi,
  /©|\ball rights reserved\b/gi,
];

// Whisper verbose segments expose per-segment confidence. These thresholds are
// OpenAI's own documented hallucination signals: a segment that is almost
// certainly non-speech, very low average log-probability, or highly repetitive
// (compression ratio) is dropped.
function filterLowConfidenceSegments(segments: WhisperSegment[]): { text: string; segments: WhisperSegment[] } {
  const kept = segments.filter(
    s =>
      !(typeof s.no_speech_prob === "number" && s.no_speech_prob > 0.6 && typeof s.avg_logprob === "number" && s.avg_logprob < -1) &&
      !(typeof s.compression_ratio === "number" && s.compression_ratio > 2.4),
  );
  return { text: kept.map(s => s.text).join("").trim(), segments: kept };
}

// True when the text is only hallucination artifacts (nothing meaningful left
// once the known junk phrases are stripped). Empty strings are handled by the
// caller as legitimate silence, so they are not treated as hallucinations here.
function isPureHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  let residual = trimmed;
  for (const re of HALLUCINATION_PATTERNS) residual = residual.replace(re, " ");
  // Strip ASCII punctuation/whitespace/control but keep alphanumerics and any
  // non-ASCII letters (accented Latin, CJK, Arabic, …) so non-English speech is
  // never mistaken for junk. Avoids \p{} unicode escapes (needs a newer target).
  const substantive = residual.replace(/[^A-Za-z0-9À-￿]/g, "");
  return substantive.length < 3;
}

// Apply segment-confidence filtering (whisper verbose) then the artifact check.
// Returns the cleaned text and the surviving segments.
function scrubTranscript(text: string, segments: WhisperSegment[]): { text: string; segments: WhisperSegment[] } {
  let outText = text;
  let outSegments = segments;
  if (segments.length > 0) {
    const filtered = filterLowConfidenceSegments(segments);
    outSegments = filtered.segments;
    outText = filtered.text;
  }
  if (isPureHallucination(outText)) return { text: "", segments: [] };
  return { text: outText, segments: outSegments };
}

/**
 * Transcribe raw audio bytes by multipart-POSTing them straight to
 * `{BUILT_IN_FORGE_API_URL}/v1/audio/transcriptions`. No object storage, no
 * signed URL — works with plain OpenAI (Option B) as well as Forge.
 */
export async function transcribeBytes(
  audio: Buffer | Uint8Array,
  mimeType: string,
  options: TranscribeBytesOptions = {}
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    if (!ENV.forgeApiUrl) {
      return { error: "Voice transcription service is not configured", code: "SERVICE_ERROR", details: "BUILT_IN_FORGE_API_URL is not set" };
    }
    if (!ENV.forgeApiKey) {
      return { error: "Voice transcription service authentication is missing", code: "SERVICE_ERROR", details: "BUILT_IN_FORGE_API_KEY is not set" };
    }
    if (audio.byteLength > MAX_AUDIO_BYTES) {
      return {
        error: "Audio file exceeds maximum size limit",
        code: "FILE_TOO_LARGE",
        details: `File size is ${(audio.byteLength / (1024 * 1024)).toFixed(2)}MB, maximum allowed is 16MB`,
      };
    }
    const ext = audioExtensionFor(mimeType);
    if (!ext) {
      return { error: "Unsupported audio format", code: "INVALID_FORMAT", details: `MIME type ${mimeType} is not supported` };
    }

    const formData = new FormData();
    const cleanMime = mimeType.split(";")[0].trim();
    formData.append("file", new Blob([new Uint8Array(audio)], { type: cleanMime }), `audio.${ext}`);
    const model = resolveTranscriptionModel(ENV.transcriptionModel);
    formData.append("model", model);
    // gpt-4o-*-transcribe models only support json/text; whisper-1 gives us
    // language + duration via verbose_json.
    formData.append("response_format", model === "whisper-1" ? "verbose_json" : "json");
    if (options.language) formData.append("language", options.language);
    const prompt =
      options.prompt ||
      (options.language
        ? `Transcribe the user's voice to text, the user's working language is ${getLanguageName(options.language)}`
        : "Transcribe the user's voice to text");
    formData.append("prompt", prompt);
    // temperature=0 makes decoding deterministic and reduces invented text.
    // Only whisper-1 documents this parameter on the transcription endpoint;
    // the gpt-4o-*-transcribe models are already low-temperature by default and
    // can reject unknown params, so we scope it to whisper-1.
    if (model === "whisper-1") formData.append("temperature", "0");

    const response = await fetch(providerEndpoint(ENV.forgeApiUrl, "v1/audio/transcriptions"), {
      method: "POST",
      headers: { authorization: `Bearer ${ENV.forgeApiKey}`, "Accept-Encoding": "identity" },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText.slice(0, 500)}` : ""}`,
      };
    }

    const json = (await response.json()) as Partial<WhisperResponse>;
    if (typeof json.text !== "string") {
      return { error: "Invalid transcription response", code: "SERVICE_ERROR", details: "Transcription service returned an invalid response format" };
    }
    // Drop silence/noise hallucinations before returning. Silence legitimately
    // transcribes to "" — that's a result, not an error.
    const scrubbed = scrubTranscript(json.text, json.segments ?? []);
    return {
      task: "transcribe",
      language: json.language ?? options.language ?? "",
      duration: json.duration ?? 0,
      text: scrubbed.text,
      segments: scrubbed.segments,
    };
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "An unexpected error occurred",
    };
  }
}

/**
 * Transcribe audio at a URL (legacy Forge storage flow): downloads the file and
 * delegates to `transcribeBytes`.
 */
export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  let audioBuffer: Buffer;
  let mimeType: string;
  try {
    const response = await fetch(options.audioUrl);
    if (!response.ok) {
      return { error: "Failed to download audio file", code: "INVALID_FORMAT", details: `HTTP ${response.status}: ${response.statusText}` };
    }
    audioBuffer = Buffer.from(await response.arrayBuffer());
    mimeType = response.headers.get("content-type") || "audio/mpeg";
  } catch (error) {
    return { error: "Failed to fetch audio file", code: "SERVICE_ERROR", details: error instanceof Error ? error.message : "Unknown error" };
  }
  return transcribeBytes(audioBuffer, mimeType, { language: options.language, prompt: options.prompt });
}

/**
 * Helper function to get full language name from ISO code
 */
function getLanguageName(langCode: string): string {
  const langMap: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'pl': 'Polish',
    'tr': 'Turkish',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
  };
  
  return langMap[langCode] || langCode;
}

/**
 * Example tRPC procedure implementation:
 * 
 * ```ts
 * // In server/routers.ts
 * import { transcribeAudio } from "./_core/voiceTranscription";
 * 
 * export const voiceRouter = router({
 *   transcribe: protectedProcedure
 *     .input(z.object({
 *       audioUrl: z.string(),
 *       language: z.string().optional(),
 *       prompt: z.string().optional(),
 *     }))
 *     .mutation(async ({ input, ctx }) => {
 *       const result = await transcribeAudio(input);
 *       
 *       // Check if it's an error
 *       if ('error' in result) {
 *         throw new TRPCError({
 *           code: 'BAD_REQUEST',
 *           message: result.error,
 *           cause: result,
 *         });
 *       }
 *       
 *       // Optionally save transcription to database
 *       await db.insert(transcriptions).values({
 *         userId: ctx.user.id,
 *         text: result.text,
 *         duration: result.duration,
 *         language: result.language,
 *         audioUrl: input.audioUrl,
 *         createdAt: new Date(),
 *       });
 *       
 *       return result;
 *     }),
 * });
 * ```
 */
