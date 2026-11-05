import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVE_CONFIG,
  assembleQuestion,
  planSuggestion,
  recentTurns,
  tokenSimilarity,
  type TranscriptSegment,
} from "@shared/interview/liveSession";

const seg = (source: "candidate" | "interviewer", text: string, at: number): TranscriptSegment => ({
  id: `${source}-${at}`,
  source,
  text,
  at,
});

describe("tokenSimilarity", () => {
  it("is 1 for identical text and high for a rephrase", () => {
    expect(tokenSimilarity("tell me about a dashboard", "tell me about a dashboard")).toBe(1);
    expect(tokenSimilarity("tell me about a dashboard you built", "can you tell me about a dashboard")).toBeGreaterThan(0.4);
  });
  it("is low for unrelated questions", () => {
    expect(tokenSimilarity("what is your SQL experience", "describe a conflict with a coworker")).toBeLessThan(0.2);
  });
});

describe("assembleQuestion", () => {
  it("joins the trailing interviewer run within one turn", () => {
    const segs = [
      seg("interviewer", "Walk me through", 1000),
      seg("interviewer", "a hard SQL problem you solved", 2000),
    ];
    expect(assembleQuestion(segs, DEFAULT_LIVE_CONFIG.turnGapMs)).toBe("Walk me through a hard SQL problem you solved");
  });
  it("starts a new turn after a long gap", () => {
    const segs = [
      seg("interviewer", "old question", 1000),
      seg("interviewer", "the current question", 1000 + DEFAULT_LIVE_CONFIG.turnGapMs + 5000),
    ];
    expect(assembleQuestion(segs, DEFAULT_LIVE_CONFIG.turnGapMs)).toBe("the current question");
  });
  it("ignores the candidate's own speech", () => {
    const segs = [seg("candidate", "um let me think", 1000), seg("interviewer", "why this role", 1200)];
    expect(assembleQuestion(segs, DEFAULT_LIVE_CONFIG.turnGapMs)).toBe("why this role");
  });
});

describe("planSuggestion", () => {
  const cfg = DEFAULT_LIVE_CONFIG;

  it("waits while the interviewer is still speaking", () => {
    const segs = [seg("interviewer", "tell me about", 10_000)];
    const plan = planSuggestion(segs, null, 10_000 + cfg.pauseMs - 100, cfg); // < pauseMs
    expect(plan.ready).toBe(false);
    expect(plan.reason).toBe("speaking");
  });

  it("fires once the turn ends", () => {
    const segs = [seg("interviewer", "what is your SQL experience", 10_000)];
    const plan = planSuggestion(segs, null, 10_000 + cfg.pauseMs + 100, cfg);
    expect(plan).toMatchObject({ ready: true, reason: "new", question: "what is your SQL experience" });
  });

  it("ignores the candidate stream entirely", () => {
    const segs = [seg("candidate", "I think my answer is", 10_000)];
    const plan = planSuggestion(segs, null, 10_000 + cfg.pauseMs + 100, cfg);
    expect(plan.ready).toBe(false);
    expect(plan.reason).toBe("no_input");
  });

  it("skips an exact echo of the question already answered", () => {
    const q = "tell me about a churn dashboard";
    const segs = [seg("interviewer", q, 10_000)];
    const plan = planSuggestion(segs, q, 10_000 + cfg.pauseMs + 100, cfg);
    expect(plan.ready).toBe(false);
    expect(plan.reason).toBe("duplicate");
  });

  it("re-answers (refine) when a repeat keeps similar wording but adds a word", () => {
    const first = "tell me about the dashboard";
    const clearer = "tell me about the churn dashboard you built";
    const segs = [seg("interviewer", clearer, 20_000)];
    const plan = planSuggestion(segs, first, 20_000 + cfg.pauseMs + 100, cfg);
    expect(plan).toMatchObject({ ready: true, reason: "refine", question: clearer });
  });

  it("still answers (as new) a heavily expanded restatement rather than dropping it", () => {
    const first = "tell me dashboard";
    const expanded = "tell me about the churn dashboard you built last year and the impact it had";
    const segs = [seg("interviewer", expanded, 25_000)];
    const plan = planSuggestion(segs, first, 25_000 + cfg.pauseMs + 100, cfg);
    expect(plan.ready).toBe(true);
    expect(plan.question).toBe(expanded);
  });

  it("treats a genuinely different question as new", () => {
    const segs = [seg("interviewer", "describe a conflict with a coworker", 30_000)];
    const plan = planSuggestion(segs, "what is your SQL experience", 30_000 + cfg.pauseMs + 100, cfg);
    expect(plan).toMatchObject({ ready: true, reason: "new" });
  });
});

describe("recentTurns", () => {
  it("returns the last turns oldest-first with source tags", () => {
    const segs = [
      seg("interviewer", "q1", 1),
      seg("candidate", "a1", 2),
      seg("interviewer", "q2", 3),
    ];
    expect(recentTurns(segs, 2)).toEqual([
      { source: "candidate", text: "a1" },
      { source: "interviewer", text: "q2" },
    ]);
  });
});
