import { describe, expect, it } from "vitest";
import { MalformedModelOutput, answerFeedbackSchema, answerSuggestionSchema, briefSchema, parseModelJson } from "./schemas";

describe("structured model-output validation", () => {
  it("accepts a well-formed brief", () => {
    const brief = parseModelJson(
      briefSchema,
      JSON.stringify({
        roleSummary: "Senior BI analyst",
        requirements: [{ id: "r1", text: "SQL", category: "must_have", priority: "high", evidenceIds: ["e1"], gap: false }],
        evidence: [{ id: "e1", claim: "5y SQL", source: "resume", category: "skill", verified: true }],
        gaps: [],
        questions: [{ id: "q1", text: "Tell me about a dashboard", category: "behavioral", difficulty: "medium" }],
        checklist: ["Review metrics"],
      }),
    );
    expect(brief.requirements[0].id).toBe("r1");
  });

  it("throws MalformedModelOutput on non-JSON", () => {
    expect(() => parseModelJson(briefSchema, "not json at all")).toThrow(MalformedModelOutput);
  });

  it("throws MalformedModelOutput when a required field is missing", () => {
    expect(() => parseModelJson(briefSchema, JSON.stringify({ roleSummary: "x" }))).toThrow(MalformedModelOutput);
  });

  it("rejects out-of-range rubric scores", () => {
    const payload = {
      scores: { relevance: 9, structure: 3, evidence: 3, technicalCorrectness: 3, clarity: 3, concision: 3 },
      strengths: [],
      improvements: [],
      unsupportedClaims: [],
      suggestedOutline: [],
      followUpQuestions: [],
    };
    expect(() => parseModelJson(answerFeedbackSchema, JSON.stringify(payload))).toThrow(MalformedModelOutput);
  });
});

describe("answer suggestion own-words note", () => {
  const base = { directAnswer: "x", bullets: [], evidence: [], assumptions: [], unsupportedClaims: [], confidence: "high", shouldVerify: false };

  it("keeps the note, and treats a strict-mode null as absent", () => {
    expect(answerSuggestionSchema.parse({ ...base, addYourOwn: "Add what took the time." }).addYourOwn).toBe("Add what took the time.");
    expect(parseModelJson(answerSuggestionSchema, JSON.stringify({ ...base, addYourOwn: null })).addYourOwn).toBeUndefined();
  });
});
