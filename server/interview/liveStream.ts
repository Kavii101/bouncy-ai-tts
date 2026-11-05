// SSE route for streaming a live suggestion token-by-token.
//
// POST /api/interview/live/stream  { question, recent?, workspaceId? }
//
// Streams `data: {"delta": "..."}` frames as the model produces text, then a
// final `event: final` frame carrying the fully parsed + grounded suggestion.
// The client renders the streaming text immediately (first token in a few
// hundred ms) and swaps in the grounded structure when `final` arrives, so
// grounding is never sacrificed for speed.
//
// Single-user by design (matches the tRPC router): no auth, shared "solo"
// workspace unless a workspaceId is supplied.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ENV } from "../_core/env";
import { invokeLLMStream } from "../_core/llm";
import {
  SUGGEST_MAX_TOKENS,
  SUGGEST_SCHEMA,
  SUGGEST_SYSTEM,
  buildSuggestUser,
  finalizeSuggestion,
} from "./answer-engine";
import { interviewLog } from "./redaction";
import { briefSchema } from "./schemas";
import { getBrief } from "./store";

const bodySchema = z.object({
  question: z.string().min(1).max(2000),
  workspaceId: z.string().min(1).max(128).optional(),
  recent: z
    .array(z.object({ source: z.enum(["candidate", "interviewer"]), text: z.string().max(2000) }))
    .max(12)
    .optional(),
});

export function registerInterviewStreamRoute(app: Express): void {
  app.post("/api/interview/live/stream", async (req: Request, res: Response) => {
    if (!ENV.interviewCopilotEnabled || !ENV.interviewLiveAssistEnabled) {
      res.status(404).json({ error: "not_enabled" });
      return;
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request" });
      return;
    }
    const { question, recent } = parsed.data;
    // Same single-user mapping as the tRPC router: a missing or "user"
    // workspace resolves to the shared "solo" workspace.
    const workspaceId = parsed.data.workspaceId && parsed.data.workspaceId !== "user" ? parsed.data.workspaceId : "solo";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const sendError = (message: string) => {
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
        res.end();
      }
    };

    try {
      const row = await getBrief(workspaceId);
      if (!row || row.approved !== "approved") {
        sendError("Approve your brief before using live assist.");
        return;
      }
      const brief = briefSchema.parse(JSON.parse(row.briefJson));

      // Must be `res`: `req` is already destroyed once express.json has consumed
      // the body, so its "close" never fires and a disconnected client would
      // keep the upstream stream (and its token spend) running.
      const upstream = new AbortController();
      let aborted = false;
      res.on("close", () => {
        aborted = true;
        upstream.abort();
      });

      const started = Date.now();
      let full = "";
      for await (const delta of invokeLLMStream({
        messages: [
          { role: "system", content: SUGGEST_SYSTEM },
          { role: "user", content: buildSuggestUser(brief, question, recent) },
        ],
        outputSchema: SUGGEST_SCHEMA,
        maxTokens: SUGGEST_MAX_TOKENS,
        signal: upstream.signal,
      })) {
        if (aborted || res.writableEnded) break;
        full += delta;
        res.write(`data: ${JSON.stringify({ delta })}\n\n`);
      }

      if (aborted || res.writableEnded) return;

      try {
        const suggestion = finalizeSuggestion(full, brief);
        interviewLog("live_stream_done", { workspaceId, latencyMs: Date.now() - started, confidence: suggestion.confidence, shouldVerify: suggestion.shouldVerify });
        res.write(`event: final\ndata: ${JSON.stringify({ suggestion })}\n\n`);
        res.end();
      } catch {
        // The stream produced text but it did not parse/ground cleanly.
        sendError("The assistant returned an unexpected format. Try again.");
      }
    } catch (error) {
      interviewLog("live_stream_error", { workspaceId, errorType: error instanceof Error ? error.name : "unknown" });
      sendError("Live assist is temporarily unavailable. Try again.");
    }
  });
}
