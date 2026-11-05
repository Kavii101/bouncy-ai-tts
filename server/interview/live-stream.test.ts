import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const upstream = vi.hoisted(() => ({ yielded: 0, released: false }));

vi.mock("../_core/env", () => ({ ENV: { interviewCopilotEnabled: true, interviewLiveAssistEnabled: true } }));
vi.mock("./store", () => ({ getBrief: async () => ({ approved: "approved", briefJson: "{}" }) }));
vi.mock("./schemas", async importOriginal => ({
  ...(await importOriginal<typeof import("./schemas")>()),
  briefSchema: { parse: (v: unknown) => v },
}));
vi.mock("./answer-engine", () => ({
  SUGGEST_MAX_TOKENS: 1,
  SUGGEST_SCHEMA: {},
  SUGGEST_SYSTEM: "",
  buildSuggestUser: () => "",
  finalizeSuggestion: () => ({}),
}));
vi.mock("../_core/llm", () => ({
  async *invokeLLMStream({ signal }: { signal: AbortSignal }) {
    try {
      for (;;) {
        upstream.yielded++;
        yield "x";
        await new Promise(resolve => setTimeout(resolve, 10));
        if (signal.aborted) throw new DOMException("aborted", "AbortError");
      }
    } finally {
      upstream.released = true;
    }
  },
}));

import { registerInterviewStreamRoute } from "./liveStream";

describe("live suggestion stream", () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerInterviewStreamRoute(app);
    await new Promise<void>(resolve => { server = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/interview/live/stream`;
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it("stops the upstream provider stream when the client disconnects", async () => {
    const logged = vi.spyOn(console, "info");
    const controller = new AbortController();
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "q" }),
      signal: controller.signal,
    });
    await res.body!.getReader().read();
    controller.abort();
    await vi.waitFor(() => expect(upstream.released).toBe(true), { timeout: 2000 });
    // A deliberate cancel must not read as a failure in the logs.
    expect(logged.mock.calls.flat().join(" ")).not.toContain("live_stream_error");
  });
});
