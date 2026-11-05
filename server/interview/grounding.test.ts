import { describe, expect, it } from "vitest";
import { approvedEvidenceIds, cappedConfidence, groundSuggestion } from "./grounding";
import type { AnswerSuggestion, Brief } from "./schemas";

const brief: Brief = {
  roleSummary: "BI analyst",
  requirements: [],
  evidence: [
    { id: "e1", claim: "Built a churn dashboard", source: "resume", category: "project", verified: true },
    { id: "e2", claim: "Knows SQL", source: "resume", category: "skill", verified: false },
  ],
  gaps: [],
  questions: [],
  checklist: [],
};

const base: AnswerSuggestion = {
  directAnswer: "x",
  bullets: ["a", "b"],
  evidence: [],
  assumptions: [],
  unsupportedClaims: [],
  confidence: "high",
  shouldVerify: false,
};

describe("grounding", () => {
  it("keeps only evidence ids present in the approved brief", () => {
    const ids = approvedEvidenceIds(brief);
    const out = groundSuggestion(
      {
        ...base,
        evidence: [
          { evidenceId: "e1", claim: "Built a churn dashboard", verified: true },
          { evidenceId: "e99", claim: "Led a team of 50", verified: true },
        ],
      },
      ids,
    );
    expect(out.evidence.map(e => e.evidenceId)).toEqual(["e1"]);
    // The dropped, unknown-id claim must surface as unsupported.
    expect(out.unsupportedClaims).toContain("Led a team of 50");
    expect(out.shouldVerify).toBe(true);
  });

  it("forces shouldVerify when there is no grounding evidence at all", () => {
    const out = groundSuggestion({ ...base, evidence: [] }, approvedEvidenceIds(brief));
    expect(out.shouldVerify).toBe(true);
  });

  it("forces shouldVerify when leaning on unverified evidence", () => {
    const out = groundSuggestion(
      { ...base, evidence: [{ evidenceId: "e2", claim: "Knows SQL", verified: false }] },
      approvedEvidenceIds(brief),
    );
    expect(out.shouldVerify).toBe(true);
  });

  it("leaves a fully-grounded, verified suggestion unflagged", () => {
    const out = groundSuggestion(
      { ...base, evidence: [{ evidenceId: "e1", claim: "Built a churn dashboard", verified: true }] },
      approvedEvidenceIds(brief),
    );
    expect(out.shouldVerify).toBe(false);
    expect(out.unsupportedClaims).toEqual([]);
  });

  it("caps confidence below high whenever verification is needed", () => {
    expect(cappedConfidence({ ...base, confidence: "high", shouldVerify: true })).toBe("medium");
    expect(cappedConfidence({ ...base, confidence: "high", unsupportedClaims: ["z"] })).toBe("medium");
    expect(cappedConfidence({ ...base, confidence: "high" })).toBe("high");
  });
});

describe("small talk", () => {
  it("does not ask the candidate to verify a greeting", () => {
    const greeting = { directAnswer: "Yes, I can hear you well, thanks.", bullets: [], evidence: [], assumptions: [], unsupportedClaims: [], shouldVerify: false, confidence: "high" as const };
    expect(groundSuggestion(greeting, new Set()).shouldVerify).toBe(false);
  });
});
