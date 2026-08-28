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
