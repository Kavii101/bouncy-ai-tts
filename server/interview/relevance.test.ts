import { describe, expect, it } from "vitest";
import { rankByRelevance, relevantContext } from "./answer-engine";
import type { Brief } from "./schemas";

const evidence = (n: number, claim: string) => ({ id: `e${n}`, claim, source: "resume" as const, category: "work", verified: true });

const brief: Brief = {
  roleSummary: "BI lead",
  requirements: [],
  evidence: [...Array.from({ length: 20 }, (_, i) => evidence(i, `Generic reporting duty number ${i}`)), evidence(99, "Migrated Tableau dashboards to Looker for finance")],
  gaps: [],
  questions: [],
  checklist: [],
};

describe("question-aware context", () => {
  it("surfaces evidence from far down the résumé when the question asks about it", () => {
    expect(relevantContext(brief, "Have you ever migrated dashboards to Looker?")).toContain("[e99]");
  });

  it("ranks the matching item first", () => {
    const ranked = rankByRelevance(brief.evidence, e => e.claim, "Looker migration");
    expect(ranked[0].id).toBe("e99");
  });

  it("keeps the brief's own order when nothing matches", () => {
    const ranked = rankByRelevance(brief.evidence, e => e.claim, "");
    expect(ranked.map(e => e.id).slice(0, 3)).toEqual(["e0", "e1", "e2"]);
  });

  it("ignores filler words", () => {
    const items = ["the of and with", "Kubernetes"];
    expect(rankByRelevance(items, s => s, "what is the role of kubernetes")[0]).toBe("Kubernetes");
  });
});
