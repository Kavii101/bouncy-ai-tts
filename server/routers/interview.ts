// Interview Copilot router.
//
// Mounted at `interview` on the app router. Every procedure is behind the
// `INTERVIEW_COPILOT_ENABLED` flag (live assist behind its own flag). By product
// choice the feature is single-user and requires no login: when a Manus session
// is present we scope to that user's workspace, otherwise everything shares one
// local "solo" workspace. Errors map to safe, user-facing messages without
// leaking raw content.

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "../_core/env";
import { publicProcedure, router } from "../_core/trpc";
import { transcribeBytes } from "../_core/voiceTranscription";
import { ensureWorkspaceAccess } from "../db";
import { extractBrief } from "../interview/extraction";
import { scoreAnswer, suggestAnswer } from "../interview/answer-engine";
import { checkReadOnlySql, generateSql } from "../interview/sql-engine";
import { interviewLog } from "../interview/redaction";
import {
  MalformedModelOutput,
  PRACTICE_CATEGORIES,
  PROMPT_VERSION,
  SQL_DIALECTS,
  briefSchema,
  type Brief,
} from "../interview/schemas";
import * as store from "../interview/store";

const workspaceInput = z.object({ workspaceId: z.string().min(1).max(128).default("user") });

type Ctx = { user: { id: number } | null };

// Single-user, no-login by design. If a session is present, scope to that user;
// otherwise use one shared "solo" workspace and skip the membership check.
async function resolveWorkspace(ctx: Ctx, inputWorkspaceId: string): Promise<{ workspaceId: string; userId: number }> {
  const user = ctx.user;
  if (user) {
    const workspaceId = inputWorkspaceId === "user" ? `user-${user.id}` : inputWorkspaceId;
    await ensureWorkspaceAccess(workspaceId, user.id);
    return { workspaceId, userId: user.id };
  }
  const workspaceId = inputWorkspaceId && inputWorkspaceId !== "user" ? inputWorkspaceId : "solo";
  return { workspaceId, userId: 0 };
}

function requireEnabled() {
  if (!ENV.interviewCopilotEnabled) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Interview Copilot is not enabled." });
  }
}

function requireLiveAssist() {
  if (!ENV.interviewLiveAssistEnabled) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Live assist is not enabled." });
  }
}

function mapError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof MalformedModelOutput) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The assistant returned an unexpected format. Try again." });
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "WORKSPACE_FORBIDDEN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this workspace." });
  }
  if (message === "DATABASE_UNAVAILABLE") {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Storage is temporarily unavailable. Try again." });
  }
  if (message.startsWith("SQL_REJECTED:")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That SQL is not a single read-only query." });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong. Try again." });
}

function parseStoredBrief(briefJson: string): Brief {
  return briefSchema.parse(JSON.parse(briefJson));
}

export const interviewRouter = router({
  config: publicProcedure.query(() => ({
    enabled: ENV.interviewCopilotEnabled,
    liveAssistEnabled: ENV.interviewCopilotEnabled && ENV.interviewLiveAssistEnabled,
    dialects: SQL_DIALECTS,
    categories: PRACTICE_CATEGORIES,
    promptVersion: PROMPT_VERSION,
  })),

  materials: router({
    create: publicProcedure
      .input(
        workspaceInput.extend({
          kind: z.enum(["job_description", "resume", "project", "notes"]),
          text: z.string().min(1).max(60_000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        try {
          const { workspaceId, userId } = await resolveWorkspace(ctx, input.workspaceId);
          const normalized = input.text.replace(/\r\n/g, "\n").trim();
          const material = await store.createMaterial({ workspaceId, userId, kind: input.kind, normalizedText: normalized });
          await store.addAudit({ workspaceId, userId, event: "material_created", detail: input.kind });
          interviewLog("material_created", { workspaceId, userId, kind: input.kind, charCount: normalized.length });
          return { materialId: material?.materialId, kind: input.kind, charCount: normalized.length };
        } catch (error) {
          mapError(error);
        }
      }),

    list: publicProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
      requireEnabled();
      try {
        const { workspaceId } = await resolveWorkspace(ctx, input.workspaceId);
        return store.listMaterials(workspaceId);
      } catch (error) {
        mapError(error);
      }
    }),

    delete: publicProcedure
      .input(workspaceInput.extend({ materialId: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        try {
          const { workspaceId, userId } = await resolveWorkspace(ctx, input.workspaceId);
          await store.deleteMaterial(input.materialId, workspaceId);
          await store.addAudit({ workspaceId, userId, event: "material_deleted" });
          interviewLog("material_deleted", { workspaceId, userId });
          return { success: true } as const;
        } catch (error) {
          mapError(error);
        }
      }),
  }),

  brief: router({
    generate: publicProcedure.input(workspaceInput).mutation(async ({ ctx, input }) => {
      requireEnabled();
      try {
        const { workspaceId, userId } = await resolveWorkspace(ctx, input.workspaceId);
        const materials = await store.getActiveMaterialTexts(workspaceId);
        const byKind = (kind: string) =>
          materials
            .filter(m => m.kind === kind && m.normalizedText)
            .map(m => m.normalizedText as string)
            .join("\n\n");
        const jdText = byKind("job_description");
        const resumeText = byKind("resume");
        const notesText = [byKind("project"), byKind("notes")].filter(Boolean).join("\n\n");
        if (!jdText && !resumeText) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Add a job description or resume first." });
        }
        const started = Date.now();
        const { brief, model } = await extractBrief({ jdText, resumeText, notesText: notesText || undefined });
        await store.upsertBrief({ workspaceId, userId, briefJson: JSON.stringify(brief), model, promptVersion: PROMPT_VERSION });
        await store.addAudit({ workspaceId, userId, event: "brief_generated" });
        interviewLog("brief_generated", {
          workspaceId,
          userId,
          model,
          latencyMs: Date.now() - started,
          requirements: brief.requirements.length,
          evidence: brief.evidence.length,
          questions: brief.questions.length,
        });
        return { brief, approved: "draft" as const };
      } catch (error) {
        mapError(error);
      }
    }),

    get: publicProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
      requireEnabled();
      try {
        const { workspaceId } = await resolveWorkspace(ctx, input.workspaceId);
        const row = await store.getBrief(workspaceId);
        if (!row) return null;
        return { brief: parseStoredBrief(row.briefJson), approved: row.approved, updatedAt: row.updatedAt };
      } catch (error) {
        mapError(error);
      }
    }),

    approve: publicProcedure.input(workspaceInput).mutation(async ({ ctx, input }) => {
      requireEnabled();
      try {
        const { workspaceId, userId } = await resolveWorkspace(ctx, input.workspaceId);
        const row = await store.approveBrief(workspaceId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Generate a brief first." });
        await store.addAudit({ workspaceId, userId, event: "brief_approved" });
        return { approved: row.approved };
      } catch (error) {
        mapError(error);
      }
    }),
  }),

  practice: router({
    // Questions come from the approved brief — nothing unverified is practiced.
    questions: publicProcedure.input(workspaceInput).query(async ({ ctx, input }) => {
      requireEnabled();
      try {
        const { workspaceId } = await resolveWorkspace(ctx, input.workspaceId);
        const row = await store.getBrief(workspaceId);
        if (!row || row.approved !== "approved") return { approved: false as const, questions: [] };
        return { approved: true as const, questions: parseStoredBrief(row.briefJson).questions };
      } catch (error) {
        mapError(error);
      }
    }),

    submitAnswer: publicProcedure
      .input(
        workspaceInput.extend({
          question: z.string().min(1).max(600),
          category: z.enum(PRACTICE_CATEGORIES),
          answer: z.string().min(1).max(20_000),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        try {
          const { workspaceId, userId } = await resolveWorkspace(ctx, input.workspaceId);
          const row = await store.getBrief(workspaceId);
          if (!row || row.approved !== "approved") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Approve your brief before practicing." });
          }
          const brief = parseStoredBrief(row.briefJson);
          const started = Date.now();
          const { feedback, model } = await scoreAnswer({ question: input.question, category: input.category, answer: input.answer, brief });
          await store.createPracticeTurn({
            workspaceId,
            userId,
            questionText: input.question,
            category: input.category,
            answerText: input.answer,
            feedbackJson: JSON.stringify(feedback),
            model,
            promptVersion: PROMPT_VERSION,
          });
          interviewLog("practice_scored", { workspaceId, userId, category: input.category, model, latencyMs: Date.now() - started });
          return { feedback };
        } catch (error) {
          mapError(error);
        }
      }),
  }),

  sql: router({
    generate: publicProcedure
      .input(
        workspaceInput.extend({
          prompt: z.string().min(1).max(8000),
          dialect: z.enum(SQL_DIALECTS),
          schema: z.string().max(20_000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        try {
          const { workspaceId, userId } = await resolveWorkspace(ctx, input.workspaceId);
          const started = Date.now();
          const { answer, model } = await generateSql({ prompt: input.prompt, dialect: input.dialect, schema: input.schema });
          // Validation is not executed in the MVP; classify read-only vs not.
          const safety = checkReadOnlySql(answer.sql);
          const validationStatus = safety.ok ? "skipped" : "rejected";
          await store.createSqlCase({
            workspaceId,
            userId,
            dialect: input.dialect,
            promptText: input.prompt,
            solutionJson: JSON.stringify(answer),
            validationStatus,
            model,
            promptVersion: PROMPT_VERSION,
          });
          interviewLog("sql_generated", { workspaceId, userId, dialect: input.dialect, model, latencyMs: Date.now() - started, readOnly: safety.ok });
          return {
            answer,
            safety: safety.ok ? { readOnly: true as const } : { readOnly: false as const, reason: safety.reason },
          };
        } catch (error) {
          mapError(error);
        }
      }),

    // Pure safety check for user-pasted SQL. No LLM, no execution.
    check: publicProcedure
      .input(workspaceInput.extend({ sql: z.string().min(1).max(20_000) }))
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        try {
          await resolveWorkspace(ctx, input.workspaceId);
          const result = checkReadOnlySql(input.sql);
          return result.ok ? { readOnly: true as const } : { readOnly: false as const, reason: result.reason };
        } catch (error) {
          mapError(error);
        }
      }),
  }),

  live: router({
    // Both procedures are gated behind INTERVIEW_LIVE_ASSIST_ENABLED.

    // Transcribe one short audio chunk from one stream. The caller tags the
    // source ("candidate" = your mic, "interviewer" = the shared interview tab/
    // system audio), so speaker attribution is known by construction — the two
    // streams are captured separately and never mixed here.
    transcribeSegment: publicProcedure
      .input(
        workspaceInput.extend({
          source: z.enum(["candidate", "interviewer"]),
          audioBase64: z.string().min(16).max(22_000_000),
          mimeType: z.enum(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"]),
          language: z.string().max(8).optional(),
          seq: z.number().int().min(0).max(1_000_000),
          // Rolling partial (interim) transcription vs. the final utterance.
          partial: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        requireLiveAssist();
        try {
          const { workspaceId, userId } = await resolveWorkspace(ctx, input.workspaceId);
          const audio = Buffer.from(input.audioBase64, "base64");
          if (audio.byteLength > 16 * 1024 * 1024) throw new Error("VOICE_FILE_TOO_LARGE");
          // Bytes go straight to the provider — never written to storage.
          const result = await transcribeBytes(audio, input.mimeType, {
            language: input.language,
            prompt: "Transcribe one short segment of a live job interview accurately.",
          });
          if ("error" in result) throw new Error(result.code);
          // Only log finals — partials fire several times per turn.
          if (!input.partial) {
            interviewLog("live_segment", { workspaceId, userId, source: input.source, seq: input.seq, charCount: result.text.length });
          }
          return { source: input.source, seq: input.seq, text: result.text, language: result.language };
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "VOICE_FILE_TOO_LARGE") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Keep each audio chunk under 16 MB." });
          }
          mapError(error);
        }
      }),

    suggest: publicProcedure
      .input(
        workspaceInput.extend({
          question: z.string().min(1).max(2000),
          recent: z
            .array(z.object({ source: z.enum(["candidate", "interviewer"]), text: z.string().max(2000) }))
            .max(12)
            .optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        requireEnabled();
        requireLiveAssist();
        try {
          const { workspaceId, userId } = await resolveWorkspace(ctx, input.workspaceId);
          const row = await store.getBrief(workspaceId);
          if (!row || row.approved !== "approved") {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Approve your brief before using live assist." });
          }
          const brief = parseStoredBrief(row.briefJson);
          const started = Date.now();
          const { suggestion, model } = await suggestAnswer({ question: input.question, brief, recent: input.recent });
          interviewLog("live_suggested", { workspaceId, userId, model, latencyMs: Date.now() - started, confidence: suggestion.confidence, shouldVerify: suggestion.shouldVerify });
          return { suggestion };
        } catch (error) {
          mapError(error);
        }
      }),
  }),
});
