// Admin scaffolding: see provider settings and swap the API key without a redeploy.
//
// Off unless ADMIN_TOKEN is set, because this deployment has no user accounts
// yet. A submitted key is tested against the configured provider, held in memory
// only, and never sent back; a restart returns to the key in .env. The provider
// URL is deliberately read-only so a stolen token cannot redirect the key.

import { createHash, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "../_core/env";
import { providerEndpoint, resolveChatModel } from "../_core/providerConfig";
import { publicProcedure, router } from "../_core/trpc";

const VERIFY_TIMEOUT_MS = 8_000;
const startupKey = ENV.forgeApiKey;
const digest = (value: string) => createHash("sha256").update(value).digest();

function requireAdmin(token: string) {
  if (!ENV.adminToken) throw new TRPCError({ code: "NOT_FOUND", message: "The admin panel is off on this server." });
  if (!timingSafeEqual(digest(token), digest(ENV.adminToken))) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "That admin token is not right." });
  }
}

function providerHost(): string {
  try {
    return new URL(ENV.forgeApiUrl).host;
  } catch {
    return "not set";
  }
}

function status() {
  const model = resolveChatModel({ envModel: ENV.llmModel, apiUrl: ENV.forgeApiUrl });
  return {
    provider: providerHost(),
    keySource: !ENV.forgeApiKey ? ("none" as const) : ENV.forgeApiKey === startupKey ? ("env" as const) : ("session" as const),
    model: model ?? "provider default",
    claimCheckModel: ENV.claimCheckModel || model || "provider default",
    transcriptionModel: ENV.transcriptionModel || "default",
  };
}

async function keyWorks(key: string): Promise<boolean> {
  try {
    const response = await fetch(providerEndpoint(ENV.forgeApiUrl, "/v1/models"), {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

const tokenInput = z.object({ token: z.string().min(1).max(256) });

export const adminRouter = router({
  available: publicProcedure.query(() => ({ enabled: Boolean(ENV.adminToken) })),

  status: publicProcedure.input(tokenInput).mutation(({ input }) => {
    requireAdmin(input.token);
    return status();
  }),

  setApiKey: publicProcedure
    .input(tokenInput.extend({ apiKey: z.string().trim().min(20).max(512) }))
    .mutation(async ({ input }) => {
      requireAdmin(input.token);
      if (!(await keyWorks(input.apiKey))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${providerHost()} did not accept that key. Nothing was changed.` });
      }
      ENV.forgeApiKey = input.apiKey;
      return status();
    }),

  resetApiKey: publicProcedure.input(tokenInput).mutation(({ input }) => {
    requireAdmin(input.token);
    ENV.forgeApiKey = startupKey;
    return status();
  }),
});
