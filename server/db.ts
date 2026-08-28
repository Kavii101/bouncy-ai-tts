import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, ttsArtifacts, ttsJobs, ttsUsageQuotas, ttsVoiceSettings, ttsWorkspaceMembers, ttsWorkspaces, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() { if (!_db && process.env.DATABASE_URL) { try { _db = drizzle(process.env.DATABASE_URL); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; } } return _db; }

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb(); if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = values[field]; } }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  values.lastSignedIn ??= new Date(); updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const rows = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return rows[0]; }

export async function ensureWorkspaceAccess(workspaceId: string, userId: number) {
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const membership = await db.select().from(ttsWorkspaceMembers).where(and(eq(ttsWorkspaceMembers.workspaceId, workspaceId), eq(ttsWorkspaceMembers.userId, userId))).limit(1);
  if (membership[0]) return membership[0];
  if (workspaceId !== `user-${userId}`) throw new Error("WORKSPACE_FORBIDDEN");
  await db.insert(ttsWorkspaces).values({ workspaceId, displayName: "Personal workspace", ownerUserId: userId }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
  await db.insert(ttsWorkspaceMembers).values({ workspaceId, userId, role: "owner" }).onDuplicateKeyUpdate({ set: { role: "owner" } });
  return { workspaceId, userId, role: "owner" as const };
}

export async function findTtsJobByIdempotency(workspaceId: string, idempotencyKey: string) { const db = await getDb(); if (!db) return undefined; const rows = await db.select().from(ttsJobs).where(and(eq(ttsJobs.workspaceId, workspaceId), eq(ttsJobs.idempotencyKey, idempotencyKey))).limit(1); return rows[0]; }
export async function getTtsJob(jobId: string, workspaceId: string) { const db = await getDb(); if (!db) return undefined; const rows = await db.select().from(ttsJobs).where(and(eq(ttsJobs.jobId, jobId), eq(ttsJobs.workspaceId, workspaceId))).limit(1); return rows[0]; }
export async function createTtsJob(values: typeof ttsJobs.$inferInsert) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); await db.insert(ttsJobs).values(values); return getTtsJob(values.jobId, values.workspaceId); }
export async function updateTtsJob(jobId: string, patch: Partial<typeof ttsJobs.$inferInsert>) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); await db.update(ttsJobs).set(patch).where(eq(ttsJobs.jobId, jobId)); }
export async function createArtifact(values: typeof ttsArtifacts.$inferInsert) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); await db.insert(ttsArtifacts).values(values); return values; }
export async function getArtifact(jobId: string, workspaceId: string) { const db = await getDb(); if (!db) return undefined; const rows = await db.select().from(ttsArtifacts).where(and(eq(ttsArtifacts.jobId, jobId), eq(ttsArtifacts.workspaceId, workspaceId))).limit(1); return rows[0]; }

function monthBounds(now = new Date()) { const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)); return { start, end }; }
export async function getOrCreateQuota(workspaceId: string) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const { start, end } = monthBounds(); const found = await db.select().from(ttsUsageQuotas).where(and(eq(ttsUsageQuotas.workspaceId, workspaceId), eq(ttsUsageQuotas.periodStart, start))).limit(1); if (found[0]) return found[0]; await db.insert(ttsUsageQuotas).values({ workspaceId, periodStart: start, periodEnd: end }); const created = await db.select().from(ttsUsageQuotas).where(and(eq(ttsUsageQuotas.workspaceId, workspaceId), eq(ttsUsageQuotas.periodStart, start))).limit(1); return created[0]!; }
export async function countActiveJobs(workspaceId: string) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const rows = await db.select({ count: sql<number>`count(*)` }).from(ttsJobs).where(and(eq(ttsJobs.workspaceId, workspaceId), inArray(ttsJobs.status, ["queued", "processing"]))); return Number(rows[0]?.count ?? 0); }
export async function consumeQuota(workspaceId: string, characters: number) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); const quota = await getOrCreateQuota(workspaceId); if (quota.charactersUsed + characters > quota.characterLimit) throw new Error("QUOTA_EXCEEDED"); await db.update(ttsUsageQuotas).set({ charactersUsed: sql`${ttsUsageQuotas.charactersUsed} + ${characters}` }).where(eq(ttsUsageQuotas.id, quota.id)); }
export async function listRecentJobs(workspaceId: string) { const db = await getDb(); if (!db) return []; return db.select().from(ttsJobs).where(eq(ttsJobs.workspaceId, workspaceId)).orderBy(desc(ttsJobs.createdAt)).limit(20); }
export async function saveVoiceSettings(values: typeof ttsVoiceSettings.$inferInsert) { const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE"); await db.insert(ttsVoiceSettings).values(values).onDuplicateKeyUpdate({ set: { languageCode: values.languageCode, voiceId: values.voiceId, speed: values.speed, updatedAt: new Date() } }); }
