import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const ttsWorkspaces = mysqlTable("tts_workspaces", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull().unique(),
  displayName: varchar("displayName", { length: 160 }).notNull(),
  ownerUserId: int("ownerUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const ttsWorkspaceMembers = mysqlTable("tts_workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "member"]).default("member").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  workspaceUserUnique: uniqueIndex("tts_workspace_user_unique").on(table.workspaceId, table.userId),
}));

export const ttsVoiceSettings = mysqlTable("tts_voice_settings", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  languageCode: varchar("languageCode", { length: 16 }).notNull(),
  voiceId: varchar("voiceId", { length: 64 }).notNull(),
  speed: varchar("speed", { length: 8 }).notNull().default("1"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  settingsUnique: uniqueIndex("tts_voice_settings_unique").on(table.workspaceId, table.userId),
}));

export const ttsJobs = mysqlTable("tts_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 64 }).notNull().unique(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  sourceType: mysqlEnum("sourceType", ["insight", "report", "user_text"]).notNull(),
  sourceId: varchar("sourceId", { length: 160 }),
  status: mysqlEnum("status", ["queued", "processing", "ready", "failed", "cancelled", "expired"]).notNull().default("queued"),
  textHash: varchar("textHash", { length: 64 }).notNull(),
  charCount: int("charCount").notNull(),
  languageCode: varchar("languageCode", { length: 16 }).notNull(),
  voiceId: varchar("voiceId", { length: 64 }).notNull(),
  speed: varchar("speed", { length: 8 }).notNull(),
  provider: varchar("provider", { length: 64 }),
  providerRequestId: varchar("providerRequestId", { length: 160 }),
  errorCode: varchar("errorCode", { length: 80 }),
  errorMessage: text("errorMessage"),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  idempotencyUnique: uniqueIndex("tts_job_idempotency_unique").on(table.workspaceId, table.idempotencyKey),
}));

export const ttsArtifacts = mysqlTable("tts_artifacts", {
  id: int("id").autoincrement().primaryKey(),
  jobId: varchar("jobId", { length: 64 }).notNull().unique(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  byteSize: int("byteSize").notNull(),
  durationMs: int("durationMs"),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const ttsUsageQuotas = mysqlTable("tts_usage_quotas", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd").notNull(),
  characterLimit: int("characterLimit").notNull().default(100000),
  charactersUsed: int("charactersUsed").notNull().default(0),
  concurrentLimit: int("concurrentLimit").notNull().default(2),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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

export const interviewMaterials = mysqlTable("interview_materials", {
  id: int("id").autoincrement().primaryKey(),
  materialId: varchar("materialId", { length: 64 }).notNull().unique(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  kind: mysqlEnum("kind", ["job_description", "resume", "project", "notes"]).notNull(),
  sourceType: mysqlEnum("sourceType", ["pasted", "uploaded"]).notNull().default("pasted"),
  // Normalized text. Nullable so a deletion can null it out without losing the
  // audit row. The storage helper has no object delete, so files are not stored
  // here in the MVP; paste-only keeps raw bytes out of object storage entirely.
  normalizedText: text("normalizedText"),
  contentHash: varchar("contentHash", { length: 64 }).notNull(),
  charCount: int("charCount").notNull(),
  status: mysqlEnum("status", ["active", "deleted"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const interviewBriefs = mysqlTable("interview_briefs", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  // Structured brief as produced by the extraction engine and validated
  // server-side: role summary, requirements, evidence map, gaps, questions.
  briefJson: text("briefJson").notNull(),
  // The user must review and approve before any AI result is treated as
  // verified. Nothing downstream consumes an unapproved brief.
  approved: mysqlEnum("approved", ["draft", "approved"]).notNull().default("draft"),
  model: varchar("model", { length: 80 }),
  promptVersion: varchar("promptVersion", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  briefWorkspaceUnique: uniqueIndex("interview_brief_workspace_unique").on(table.workspaceId),
}));

export const interviewPracticeTurns = mysqlTable("interview_practice_turns", {
  id: int("id").autoincrement().primaryKey(),
  turnId: varchar("turnId", { length: 64 }).notNull().unique(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  questionText: text("questionText").notNull(),
  category: varchar("category", { length: 48 }).notNull(),
  // Answer is stored only as a hash by default; the feedback itself is the
  // durable artifact. The raw answer never touches the database or logs.
  answerHash: varchar("answerHash", { length: 64 }).notNull(),
  answerCharCount: int("answerCharCount").notNull(),
  feedbackJson: text("feedbackJson").notNull(),
  model: varchar("model", { length: 80 }),
  promptVersion: varchar("promptVersion", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const interviewSqlCases = mysqlTable("interview_sql_cases", {
  id: int("id").autoincrement().primaryKey(),
  caseId: varchar("caseId", { length: 64 }).notNull().unique(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  dialect: varchar("dialect", { length: 32 }).notNull(),
  promptHash: varchar("promptHash", { length: 64 }).notNull(),
  solutionJson: text("solutionJson").notNull(),
  validationStatus: mysqlEnum("validationStatus", ["not_run", "passed", "failed", "skipped", "rejected"]).notNull().default("not_run"),
  model: varchar("model", { length: 80 }),
  promptVersion: varchar("promptVersion", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const interviewAuditEvents = mysqlTable("interview_audit_events", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: varchar("workspaceId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  // Non-content audit only: event type and a short non-sensitive detail.
  event: varchar("event", { length: 64 }).notNull(),
  detail: varchar("detail", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InterviewMaterial = typeof interviewMaterials.$inferSelect;
export type InterviewBrief = typeof interviewBriefs.$inferSelect;
export type InterviewPracticeTurn = typeof interviewPracticeTurns.$inferSelect;
export type InterviewSqlCase = typeof interviewSqlCases.$inferSelect;
