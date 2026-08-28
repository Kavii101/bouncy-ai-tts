import { describe, expect, it } from "vitest";
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
  it("rejects recordings beyond the request envelope before provider work", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.voice.transcribe({ ...validInput, audioBase64: "a".repeat(22_000_001) })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
