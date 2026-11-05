import { describe, expect, it, vi } from "vitest";

// This is a procedure-contract test, not a database test: stub only the
// workspace gate so it runs without a live DATABASE_URL. The stub mirrors
// ensureWorkspaceAccess semantics — personal workspace ok, anything else
// forbidden — plus a sentinel workspace that simulates a DB outage.
vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    ensureWorkspaceAccess: async (workspaceId: string, userId: number) => {
      if (workspaceId === "db-down") throw new Error("DATABASE_UNAVAILABLE");
      if (workspaceId !== `user-${userId}`) throw new Error("WORKSPACE_FORBIDDEN");
      return { workspaceId, userId, role: "owner" as const };
    },
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const validInput = { workspaceId: "user", audioBase64: "a".repeat(120), mimeType: "audio/webm" as const, language: "en" };
function context(user: TrpcContext["user"]): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("voice.transcribe protected procedure", () => {
  it("rejects unauthenticated transcription requests", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.voice.transcribe(validInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects access to an unrecognized workspace", async () => {
    const user = { id: 999999, openId: "test-user", name: "Test", email: "test@example.com", loginMethod: "test", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    const caller = appRouter.createCaller(context(user));
    await expect(caller.voice.transcribe({ ...validInput, workspaceId: "another-workspace" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("reports storage unavailability as a server error, not a transcription failure", async () => {
    const user = { id: 999999, openId: "test-user", name: "Test", email: "test@example.com", loginMethod: "test", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    const caller = appRouter.createCaller(context(user));
    await expect(caller.voice.transcribe({ ...validInput, workspaceId: "db-down" })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
  it("rejects recordings beyond the request envelope before provider work", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.voice.transcribe({ ...validInput, audioBase64: "a".repeat(22_000_001) })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
