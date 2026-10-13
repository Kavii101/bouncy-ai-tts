import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { createArtifact, createTtsJob, ensureWorkspaceAccess, findTtsJobByIdempotency, getArtifact, getTtsJob, getOrCreateQuota, listRecentJobs, updateTtsJob, consumeQuota, countActiveJobs } from "./db";
import { DEFAULT_RETENTION_HOURS, errorCode, hashText, makeObjectKey, publicTtsConfig, synthesizeWithFailover, validateTtsRequest, type TtsSourceType } from "./tts";
import { storageGetSignedUrl, storagePut } from "./storage"; import { transcribeAudio } from "./_core/voiceTranscription";
import { interviewRouter } from "./routers/interview";

const jobs = new Map<string, AbortController>(); function logTtsEvent(event: string, data: Record<string, unknown>) { console.info(JSON.stringify({ scope: "tts", event, at: new Date().toISOString(), ...data })); }
const workspaceSchema = z.object({ workspaceId: z.string().min(1).max(128).default("user") });
const requestSchema = workspaceSchema.extend({ text: z.string(), languageCode: z.string(), voiceId: z.string(), speed: z.number(), sourceType: z.enum(["insight", "report", "user_text"]).default("user_text"), sourceId: z.string().max(160).optional(), idempotencyKey: z.string().min(8).max(128) });

function fail(error: unknown): never { const code = errorCode(error); const messages: Record<string, string> = { TEXT_EMPTY: "Enter some text to generate audio.", TEXT_TOO_LONG: "Shorten the text before generating audio.", LANGUAGE_UNSUPPORTED: "Choose a supported language.", VOICE_UNSUPPORTED: "Choose a voice supported by the selected language.", SPEED_UNSUPPORTED: "Choose a supported playback speed.", TTS_PROVIDER_NOT_CONFIGURED: "Cloud TTS is not configured yet. Use the labeled device read-aloud fallback or add provider credentials.", TTS_CANCELLED: "Audio generation was cancelled.", TTS_PROVIDER_FAILED: "The speech service is temporarily unavailable. Try again." }; throw new TRPCError({ code: code === "TEXT_EMPTY" || code === "TEXT_TOO_LONG" ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR", message: messages[code] ?? messages.TTS_PROVIDER_FAILED, cause: error }); }

export const appRouter = router({
  system: systemRouter,
  interview: interviewRouter,
  auth: router({ me: publicProcedure.query(opts => opts.ctx.user), logout: publicProcedure.mutation(({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }) }),
  voice: router({     transcribe: protectedProcedure.input(z.object({ workspaceId: z.string().min(1).max(128).default("user"), audioBase64: z.string().min(100).max(22_000_000), mimeType: z.enum(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"]), language: z.string().max(8).optional() })).mutation(async ({ ctx, input }) => {       const workspaceId = input.workspaceId === "user" ? `user-${ctx.user.id}` : input.workspaceId;       try {         await ensureWorkspaceAccess(workspaceId, ctx.user.id);         const audio = Buffer.from(input.audioBase64, "base64");         if (audio.byteLength > 16 * 1024 * 1024) throw new Error("VOICE_FILE_TOO_LARGE");         const recordingId = crypto.randomUUID();         const uploaded = await storagePut(`transcription/${workspaceId}/${recordingId}`, audio, input.mimeType);         const signedUrl = await storageGetSignedUrl(uploaded.key);         const result = await transcribeAudio({ audioUrl: signedUrl, language: input.language, prompt: "Transcribe the user's speech accurately for a business intelligence text-to-speech workflow." });         if ("error" in result) throw new Error(result.code);         logTtsEvent("transcription_ready", { correlationId: crypto.randomUUID(), workspaceId, userId: ctx.user.id, charCount: result.text.length, language: result.language });         return { text: result.text, language: result.language, duration: result.duration };       } catch (error) {         const code = error instanceof Error ? error.message : "TRANSCRIPTION_FAILED";         logTtsEvent("transcription_failed", { correlationId: crypto.randomUUID(), workspaceId, userId: ctx.user.id, errorCode: code });         if (code === "WORKSPACE_FORBIDDEN") throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace." });         if (code === "VOICE_FILE_TOO_LARGE" || code === "FILE_TOO_LARGE") throw new TRPCError({ code: "BAD_REQUEST", message: "Keep recordings under 16 MB." });         throw new TRPCError({ code: "BAD_REQUEST", message: "Speech could not be transcribed. Try again or type the text instead." });       }     }),   }),   tts: router({
    config: publicProcedure.query(() => publicTtsConfig),
    quota: protectedProcedure.input(workspaceSchema).query(async ({ ctx, input }) => { const workspaceId = input.workspaceId === "user" ? `user-${ctx.user.id}` : input.workspaceId; await ensureWorkspaceAccess(workspaceId, ctx.user.id); return getOrCreateQuota(workspaceId); }),
    recent: protectedProcedure.input(workspaceSchema).query(async ({ ctx, input }) => { const workspaceId = input.workspaceId === "user" ? `user-${ctx.user.id}` : input.workspaceId; await ensureWorkspaceAccess(workspaceId, ctx.user.id); return listRecentJobs(workspaceId); }),
    create: protectedProcedure.input(requestSchema).mutation(async ({ ctx, input }) => {
      const workspaceId = input.workspaceId === "user" ? `user-${ctx.user.id}` : input.workspaceId;
      try {
        await ensureWorkspaceAccess(workspaceId, ctx.user.id);
        const request = validateTtsRequest({ text: input.text, languageCode: input.languageCode, voiceId: input.voiceId, speed: input.speed });
        const existing = await findTtsJobByIdempotency(workspaceId, input.idempotencyKey); if (existing) return existing;
        const active = await countActiveJobs(workspaceId); const quota = await getOrCreateQuota(workspaceId);
        if (active >= quota.concurrentLimit) throw new Error("CONCURRENCY_LIMIT");
        await consumeQuota(workspaceId, request.text.length);
        const jobId = crypto.randomUUID(); const correlationId = crypto.randomUUID(); const expiresAt = new Date(Date.now() + DEFAULT_RETENTION_HOURS * 3600_000);         logTtsEvent("job_started", { correlationId, jobId, workspaceId, userId: ctx.user.id, sourceType: input.sourceType, charCount: request.text.length });
        await createTtsJob({ jobId, workspaceId, userId: ctx.user.id, sourceType: input.sourceType as TtsSourceType, sourceId: input.sourceId, status: "processing", textHash: hashText(request.text), charCount: request.text.length, languageCode: request.languageCode, voiceId: request.voiceId, speed: String(request.speed), idempotencyKey: input.idempotencyKey, expiresAt });
        const controller = new AbortController(); jobs.set(jobId, controller);
        try {
          const audio = await synthesizeWithFailover(request, controller.signal);
          const uploaded = await storagePut(makeObjectKey(workspaceId, jobId), audio.data, audio.mimeType);
          await createArtifact({ jobId, workspaceId, storageKey: uploaded.key, mimeType: audio.mimeType, byteSize: audio.data.byteLength, durationMs: audio.durationMs, checksum: crypto.createHash("sha256").update(audio.data).digest("hex"), expiresAt });
          await updateTtsJob(jobId, { status: "ready", provider: audio.provider, providerRequestId: audio.providerRequestId });           logTtsEvent("job_ready", { correlationId, jobId, workspaceId, provider: audio.provider, byteSize: audio.data.byteLength });
        } catch (error) { await updateTtsJob(jobId, { status: error instanceof Error && error.message === "TTS_CANCELLED" ? "cancelled" : "failed", errorCode: errorCode(error), errorMessage: error instanceof Error ? error.message : "TTS_FAILED" });           logTtsEvent("job_failed", { correlationId, jobId, workspaceId, errorCode: errorCode(error) }); if (error instanceof Error && error.message === "TTS_CANCELLED") return getTtsJob(jobId, workspaceId); throw error; }
        finally { jobs.delete(jobId); }
        return getTtsJob(jobId, workspaceId);
      } catch (error) { if (error instanceof TRPCError) throw error; if (error instanceof Error && ["WORKSPACE_FORBIDDEN", "CONCURRENCY_LIMIT", "QUOTA_EXCEEDED", "DATABASE_UNAVAILABLE"].includes(error.message)) throw new TRPCError({ code: error.message === "WORKSPACE_FORBIDDEN" ? "FORBIDDEN" : "BAD_REQUEST", message: error.message.replaceAll("_", " ") }); fail(error); }
    }),
    get: protectedProcedure.input(workspaceSchema.extend({ jobId: z.string().uuid() })).query(async ({ ctx, input }) => { const workspaceId = input.workspaceId === "user" ? `user-${ctx.user.id}` : input.workspaceId; await ensureWorkspaceAccess(workspaceId, ctx.user.id); const job = await getTtsJob(input.jobId, workspaceId); if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "TTS job not found" }); const artifact = job.status === "ready" ? await getArtifact(job.jobId, workspaceId) : undefined; return { job, artifact }; }),
    audioUrl: protectedProcedure.input(workspaceSchema.extend({ jobId: z.string().uuid() })).query(async ({ ctx, input }) => { const workspaceId = input.workspaceId === "user" ? `user-${ctx.user.id}` : input.workspaceId; await ensureWorkspaceAccess(workspaceId, ctx.user.id); const job = await getTtsJob(input.jobId, workspaceId); const artifact = job ? await getArtifact(job.jobId, workspaceId) : undefined; if (!job || !artifact || job.status !== "ready" || artifact.expiresAt < new Date()) throw new TRPCError({ code: "NOT_FOUND", message: "Audio is unavailable or expired" }); return { url: await storageGetSignedUrl(artifact.storageKey), mimeType: artifact.mimeType }; }),
    cancel: protectedProcedure.input(workspaceSchema.extend({ jobId: z.string().uuid() })).mutation(async ({ ctx, input }) => { const workspaceId = input.workspaceId === "user" ? `user-${ctx.user.id}` : input.workspaceId; await ensureWorkspaceAccess(workspaceId, ctx.user.id); jobs.get(input.jobId)?.abort(); return { success: true }; }),
  }),
});
export type AppRouter = typeof appRouter;
