import { beforeEach, describe, expect, it, vi } from "vitest";

const llm = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("../_core/llm", () => llm);
vi.mock("../_core/env", () => ({ ENV: { claimCheckModel: "" } }));

import { CLAIM_CHECK_TIMEOUT_MS, checkClaims, supportText, unknownNumbers } from "./claim-check";
import type { AnswerSuggestion, Brief } from "./schemas";

const brief: Brief = {
  roleSummary: "Analyst",
  requirements: [],
  evidence: [{ id: "e1", claim: "Lifted win-back rate from 9% to 14% and migrated 1,400 dashboards", source: "resume", category: "project", verified: true }],
  gaps: [],
  questions: [],
  checklist: [],
};
const answer: AnswerSuggestion = {
  directAnswer: "I lifted win-back from 9% to 14%.",
  bullets: ["I migrated 1400 dashboards."],
  evidence: [{ evidenceId: "e1", claim: "win-back", verified: true }],
  assumptions: [],
  unsupportedClaims: [],
  confidence: "high",
  shouldVerify: false,
};
const audit = (unsupported: string[]) => ({ choices: [{ message: { content: JSON.stringify({ unsupported }) } }] });

beforeEach(() => { llm.invokeLLM.mockReset(); });

describe("number check", () => {
  it("accepts evidence figures and flags invented ones", () => {
    expect(unknownNumbers(answer, supportText(brief))).toEqual([]);
    expect(unknownNumbers({ ...answer, bullets: ["Revenue rose 37%."] }, supportText(brief))).toEqual(["37"]);
  });

  it("does not let the interviewer's premise verify a number", () => {
    const support = supportText(brief, [{ source: "interviewer", text: "You led 20 people?" }]);
    expect(unknownNumbers({ ...answer, directAnswer: "I led 20 people." }, support)).toEqual(["20"]);
    const said = supportText(brief, [{ source: "candidate", text: "I led 20 people." }]);
    expect(unknownNumbers({ ...answer, directAnswer: "I led 20 people." }, said)).toEqual([]);
  });
});

describe("checkClaims", () => {
  it("keeps high confidence only when the audit passes", async () => {
    llm.invokeLLM.mockResolvedValue(audit([]));
    const out = await checkClaims({ suggestion: answer, brief });
    expect(out).toMatchObject({ confidence: "high", shouldVerify: false, unsupportedClaims: [] });
  });

  it("lists what the audit flags and lowers confidence", async () => {
    llm.invokeLLM.mockResolvedValue(audit(["while at Betway"]));
    const out = await checkClaims({ suggestion: answer, brief });
    expect(out).toMatchObject({ confidence: "medium", shouldVerify: true, unsupportedClaims: ["while at Betway"] });
  });

  it("keeps a long audit instead of rejecting it", async () => {
    llm.invokeLLM.mockResolvedValue(audit(Array.from({ length: 20 }, (_, i) => `claim ${i} ${"x".repeat(500)}`)));
    const out = await checkClaims({ suggestion: answer, brief });
    expect(out.confidence).toBe("medium");
    expect(out.unsupportedClaims).toHaveLength(10);
    expect(out.unsupportedClaims.every(c => c.length <= 400)).toBe(true);
  });

  it("never claims high confidence when the audit fails, and still checks numbers", async () => {
    llm.invokeLLM.mockRejectedValue(new Error("down"));
    const out = await checkClaims({ suggestion: { ...answer, bullets: ["Revenue rose 37%."] }, brief });
    expect(out.confidence).toBe("medium");
    expect(out.unsupportedClaims).toEqual(["The figure 37"]);
    const clean = await checkClaims({ suggestion: answer, brief });
    expect(clean).toMatchObject({ confidence: "medium", shouldVerify: false });
  });

  it("gives up on time rather than holding the answer", async () => {
    llm.invokeLLM.mockImplementation(({ signal }: { signal: AbortSignal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const started = Date.now();
    const out = await checkClaims({ suggestion: answer, brief });
    expect(out.confidence).toBe("medium");
    expect(Date.now() - started).toBeLessThan(CLAIM_CHECK_TIMEOUT_MS + 1000);
  }, 6000);

  it("skips small talk, which has nothing to audit", async () => {
    const hello = { ...answer, directAnswer: "Yes, I can hear you.", bullets: [], evidence: [] };
    expect(await checkClaims({ suggestion: hello, brief })).toEqual(hello);
    expect(llm.invokeLLM).not.toHaveBeenCalled();
  });
});
