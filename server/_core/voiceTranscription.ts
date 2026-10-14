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
    // Silence legitimately transcribes to "" — that's a result, not an error.
    return {
      task: "transcribe",
      language: json.language ?? options.language ?? "",
      duration: json.duration ?? 0,
      text: json.text,
      segments: json.segments ?? [],
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
