import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Local SQLite port of the original MySQL schema. Table and column names are
// preserved exactly so the rest of the app is unchanged. Type mapping:
//   int            -> integer
//   varchar/text   -> text
//   mysqlEnum      -> text({ enum: [...] })
//   timestamp      -> integer({ mode: "timestamp" })  (stored as epoch seconds)
//   defaultNow()   -> .$defaultFn(() => new Date())
//   onUpdateNow()  -> .$onUpdate(() => new Date())
const now = () => new Date();

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const ttsWorkspaces = sqliteTable("tts_workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspaceId").notNull().unique(),
  displayName: text("displayName").notNull(),
  ownerUserId: integer("ownerUserId").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
});

export const ttsWorkspaceMembers = sqliteTable("tts_workspace_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  role: text("role", { enum: ["owner", "member"] }).default("member").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
}, table => ({
  workspaceUserUnique: uniqueIndex("tts_workspace_user_unique").on(table.workspaceId, table.userId),
}));

export const ttsVoiceSettings = sqliteTable("tts_voice_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  languageCode: text("languageCode").notNull(),
  voiceId: text("voiceId").notNull(),
  speed: text("speed").notNull().default("1"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
}, table => ({
  settingsUnique: uniqueIndex("tts_voice_settings_unique").on(table.workspaceId, table.userId),
}));

export const ttsJobs = sqliteTable("tts_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("jobId").notNull().unique(),
  workspaceId: text("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  sourceType: text("sourceType", { enum: ["insight", "report", "user_text"] }).notNull(),
  sourceId: text("sourceId"),
  status: text("status", { enum: ["queued", "processing", "ready", "failed", "cancelled", "expired"] }).notNull().default("queued"),
  textHash: text("textHash").notNull(),
  charCount: integer("charCount").notNull(),
  languageCode: text("languageCode").notNull(),
  voiceId: text("voiceId").notNull(),
  speed: text("speed").notNull(),
  provider: text("provider"),
  providerRequestId: text("providerRequestId"),
  errorCode: text("errorCode"),
  errorMessage: text("errorMessage"),
  idempotencyKey: text("idempotencyKey").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
}, table => ({
  idempotencyUnique: uniqueIndex("tts_job_idempotency_unique").on(table.workspaceId, table.idempotencyKey),
}));

export const ttsArtifacts = sqliteTable("tts_artifacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("jobId").notNull().unique(),
  workspaceId: text("workspaceId").notNull(),
  storageKey: text("storageKey").notNull().unique(),
  mimeType: text("mimeType").notNull(),
  byteSize: integer("byteSize").notNull(),
  durationMs: integer("durationMs"),
  checksum: text("checksum").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const ttsUsageQuotas = sqliteTable("tts_usage_quotas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspaceId").notNull(),
  periodStart: integer("periodStart", { mode: "timestamp" }).notNull(),
  periodEnd: integer("periodEnd", { mode: "timestamp" }).notNull(),
  characterLimit: integer("characterLimit").notNull().default(100000),
  charactersUsed: integer("charactersUsed").notNull().default(0),
  concurrentLimit: integer("concurrentLimit").notNull().default(2),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
}, table => ({
  quotaUnique: uniqueIndex("tts_quota_period_unique").on(table.workspaceId, table.periodStart),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type TtsJob = typeof ttsJobs.$inferSelect;
export type TtsArtifact = typeof ttsArtifacts.$inferSelect;

// ---------------------------------------------------------------------------
// Interview Copilot
//
// Workspace identity and authorization reuse the existing `tts_workspaces` /
// `tts_workspace_members` tables via `ensureWorkspaceAccess`, so these tables
// only carry interview-specific state. Every table is workspace-scoped and
// must be filtered by workspaceId on every query. Raw candidate text is kept
// only where a feature needs it (materials, for extraction); practice answers
// are stored as hashes, never as raw text, matching the privacy-by-design and
// redaction principles in the product plan.
// ---------------------------------------------------------------------------

export const interviewMaterials = sqliteTable("interview_materials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  materialId: text("materialId").notNull().unique(),
  workspaceId: text("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  kind: text("kind", { enum: ["job_description", "resume", "project", "notes"] }).notNull(),
  sourceType: text("sourceType", { enum: ["pasted", "uploaded"] }).notNull().default("pasted"),
  // Normalized text. Nullable so a deletion can null it out without losing the
  // audit row. The storage helper has no object delete, so files are not stored
  // here in the MVP; paste-only keeps raw bytes out of object storage entirely.
  normalizedText: text("normalizedText"),
  contentHash: text("contentHash").notNull(),
  charCount: integer("charCount").notNull(),
  status: text("status", { enum: ["active", "deleted"] }).notNull().default("active"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
});

export const interviewBriefs = sqliteTable("interview_briefs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  // Structured brief as produced by the extraction engine and validated
  // server-side: role summary, requirements, evidence map, gaps, questions.
  briefJson: text("briefJson").notNull(),
  // The user must review and approve before any AI result is treated as
  // verified. Nothing downstream consumes an unapproved brief.
  approved: text("approved", { enum: ["draft", "approved"] }).notNull().default("draft"),
  model: text("model"),
  promptVersion: text("promptVersion").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(now).$onUpdate(now),
}, table => ({
  briefWorkspaceUnique: uniqueIndex("interview_brief_workspace_unique").on(table.workspaceId),
}));

export const interviewPracticeTurns = sqliteTable("interview_practice_turns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  turnId: text("turnId").notNull().unique(),
  workspaceId: text("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  questionText: text("questionText").notNull(),
  category: text("category").notNull(),
  // Answer is stored only as a hash by default; the feedback itself is the
  // durable artifact. The raw answer never touches the database or logs.
  answerHash: text("answerHash").notNull(),
  answerCharCount: integer("answerCharCount").notNull(),
  feedbackJson: text("feedbackJson").notNull(),
  model: text("model"),
  promptVersion: text("promptVersion").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const interviewSqlCases = sqliteTable("interview_sql_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  caseId: text("caseId").notNull().unique(),
  workspaceId: text("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  dialect: text("dialect").notNull(),
  promptHash: text("promptHash").notNull(),
  solutionJson: text("solutionJson").notNull(),
  validationStatus: text("validationStatus", { enum: ["not_run", "passed", "failed", "skipped", "rejected"] }).notNull().default("not_run"),
  model: text("model"),
  promptVersion: text("promptVersion").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export const interviewAuditEvents = sqliteTable("interview_audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspaceId").notNull(),
  userId: integer("userId").notNull(),
  // Non-content audit only: event type and a short non-sensitive detail.
  event: text("event").notNull(),
  detail: text("detail"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(now),
});

export type InterviewMaterial = typeof interviewMaterials.$inferSelect;
export type InterviewBrief = typeof interviewBriefs.$inferSelect;
export type InterviewPracticeTurn = typeof interviewPracticeTurns.$inferSelect;
export type InterviewSqlCase = typeof interviewSqlCases.$inferSelect;
