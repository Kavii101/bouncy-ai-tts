// Workspace-scoped persistence for the Interview Copilot.
//
// Mirrors the TTS data layer's conventions: a null database degrades
// gracefully for reads (return empty) and throws DATABASE_UNAVAILABLE for
// writes. Workspace authorization reuses `ensureWorkspaceAccess`; every query
// here is additionally filtered by workspaceId so one workspace can never read
// another's rows.

import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import {
  interviewAuditEvents,
  interviewBriefs,
  interviewMaterials,
  interviewPracticeTurns,
  interviewSqlCases,
} from "../../drizzle/schema";
import { getDb } from "../db";

export function hash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export type MaterialKind = "job_description" | "resume" | "project" | "notes";

export async function createMaterial(input: {
  workspaceId: string;
  userId: number;
  kind: MaterialKind;
  normalizedText: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const materialId = crypto.randomUUID();
  await db.insert(interviewMaterials).values({
    materialId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    kind: input.kind,
    sourceType: "pasted",
    normalizedText: input.normalizedText,
    contentHash: hash(input.normalizedText),
    charCount: input.normalizedText.length,
    status: "active",
  });
  return getMaterial(materialId, input.workspaceId);
}

export async function getMaterial(materialId: string, workspaceId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(interviewMaterials)
    .where(and(eq(interviewMaterials.materialId, materialId), eq(interviewMaterials.workspaceId, workspaceId)))
    .limit(1);
  return rows[0];
}

// Metadata only — never the normalized text — for list views.
export async function listMaterials(workspaceId: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      materialId: interviewMaterials.materialId,
      kind: interviewMaterials.kind,
      charCount: interviewMaterials.charCount,
      status: interviewMaterials.status,
      createdAt: interviewMaterials.createdAt,
    })
    .from(interviewMaterials)
    .where(and(eq(interviewMaterials.workspaceId, workspaceId), eq(interviewMaterials.status, "active")))
    .orderBy(desc(interviewMaterials.createdAt));
  return rows;
}

// Full active materials of a kind, for feeding extraction.
export async function getActiveMaterialTexts(workspaceId: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ kind: interviewMaterials.kind, normalizedText: interviewMaterials.normalizedText })
    .from(interviewMaterials)
    .where(and(eq(interviewMaterials.workspaceId, workspaceId), eq(interviewMaterials.status, "active")));
  return rows;
}

// Soft delete: mark deleted and null the text. The storage helper exposes no
// object delete, so for paste-only materials this is the hard delete of the
// content; the audit row is retained deliberately.
export async function deleteMaterial(materialId: string, workspaceId: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db
    .update(interviewMaterials)
    .set({ status: "deleted", normalizedText: null })
    .where(and(eq(interviewMaterials.materialId, materialId), eq(interviewMaterials.workspaceId, workspaceId)));
}

export async function upsertBrief(input: {
  workspaceId: string;
  userId: number;
  briefJson: string;
  model?: string;
  promptVersion: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  // Regenerating a brief resets it to draft — it must be re-approved.
  await db
    .insert(interviewBriefs)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      briefJson: input.briefJson,
      approved: "draft",
      model: input.model,
      promptVersion: input.promptVersion,
    })
    .onConflictDoUpdate({
      target: interviewBriefs.workspaceId,
      set: {
        briefJson: input.briefJson,
        approved: "draft",
        model: input.model,
        promptVersion: input.promptVersion,
        updatedAt: new Date(),
      },
    });
  return getBrief(input.workspaceId);
}

export async function getBrief(workspaceId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(interviewBriefs)
    .where(eq(interviewBriefs.workspaceId, workspaceId))
    .limit(1);
  return rows[0];
}

export async function approveBrief(workspaceId: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.update(interviewBriefs).set({ approved: "approved", updatedAt: new Date() }).where(eq(interviewBriefs.workspaceId, workspaceId));
  return getBrief(workspaceId);
}

export async function createPracticeTurn(input: {
  workspaceId: string;
  userId: number;
  questionText: string;
  category: string;
  answerText: string;
  feedbackJson: string;
  model?: string;
  promptVersion: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const turnId = crypto.randomUUID();
  await db.insert(interviewPracticeTurns).values({
    turnId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    questionText: input.questionText,
    category: input.category,
    answerHash: hash(input.answerText),
    answerCharCount: input.answerText.length,
    feedbackJson: input.feedbackJson,
    model: input.model,
    promptVersion: input.promptVersion,
  });
  return turnId;
}

export async function listPracticeTurns(workspaceId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      turnId: interviewPracticeTurns.turnId,
      questionText: interviewPracticeTurns.questionText,
      category: interviewPracticeTurns.category,
      feedbackJson: interviewPracticeTurns.feedbackJson,
      createdAt: interviewPracticeTurns.createdAt,
    })
    .from(interviewPracticeTurns)
    .where(eq(interviewPracticeTurns.workspaceId, workspaceId))
    .orderBy(desc(interviewPracticeTurns.createdAt))
    .limit(20);
}

export async function createSqlCase(input: {
  workspaceId: string;
  userId: number;
  dialect: string;
  promptText: string;
  solutionJson: string;
  validationStatus: "not_run" | "passed" | "failed" | "skipped" | "rejected";
  model?: string;
  promptVersion: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const caseId = crypto.randomUUID();
  await db.insert(interviewSqlCases).values({
    caseId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    dialect: input.dialect,
    promptHash: hash(input.promptText),
    solutionJson: input.solutionJson,
    validationStatus: input.validationStatus,
    model: input.model,
    promptVersion: input.promptVersion,
  });
  return caseId;
}

export async function listSqlCases(workspaceId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      caseId: interviewSqlCases.caseId,
      dialect: interviewSqlCases.dialect,
      solutionJson: interviewSqlCases.solutionJson,
      validationStatus: interviewSqlCases.validationStatus,
      createdAt: interviewSqlCases.createdAt,
    })
    .from(interviewSqlCases)
    .where(eq(interviewSqlCases.workspaceId, workspaceId))
    .orderBy(desc(interviewSqlCases.createdAt))
    .limit(20);
}

export async function addAudit(input: {
  workspaceId: string;
  userId: number;
  event: string;
  detail?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(interviewAuditEvents).values({
    workspaceId: input.workspaceId,
    userId: input.userId,
    event: input.event,
    detail: input.detail,
  });
}
