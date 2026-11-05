import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_core/env", () => ({
  ENV: { adminToken: "", forgeApiKey: "env-key", forgeApiUrl: "https://api.openai.com", llmModel: "gpt-4.1", claimCheckModel: "", transcriptionModel: "gpt-4o-transcribe" },
}));

import { ENV } from "../_core/env";
import { adminRouter } from "./admin";

const api = adminRouter.createCaller({} as never);
const NEW_KEY = "new-key-that-is-long-enough";

beforeEach(() => {
  ENV.adminToken = "secret-token";
  ENV.forgeApiKey = "env-key";
});
afterEach(() => vi.unstubAllGlobals());

describe("admin panel", () => {
  it("is off without a token, and says nothing useful", async () => {
    ENV.adminToken = "";
    expect(await api.available()).toEqual({ enabled: false });
    await expect(api.status({ token: "anything" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a wrong token without touching the key", async () => {
    await expect(api.status({ token: "wrong" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(api.setApiKey({ token: "wrong", apiKey: NEW_KEY })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(ENV.forgeApiKey).toBe("env-key");
  });

  it("reports settings but never the key", async () => {
    const out = await api.status({ token: "secret-token" });
    expect(out).toMatchObject({ provider: "api.openai.com", keySource: "env", model: "gpt-4.1", claimCheckModel: "gpt-4.1" });
    expect(JSON.stringify(out)).not.toContain("env-key");
  });

  it("uses a new key only after the provider accepts it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const out = await api.setApiKey({ token: "secret-token", apiKey: NEW_KEY });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
    expect(out.keySource).toBe("session");
    expect(JSON.stringify(out)).not.toContain(NEW_KEY);
    expect(ENV.forgeApiKey).toBe(NEW_KEY);
  });

  it("keeps the working key when the provider rejects the new one or is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(api.setApiKey({ token: "secret-token", apiKey: NEW_KEY })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(api.setApiKey({ token: "secret-token", apiKey: NEW_KEY })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(ENV.forgeApiKey).toBe("env-key");
  });

  it("goes back to the key the server started with", async () => {
    ENV.forgeApiKey = NEW_KEY;
    expect((await api.resetApiKey({ token: "secret-token" })).keySource).toBe("env");
  });
});
