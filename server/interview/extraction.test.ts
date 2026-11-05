import { describe, expect, it, vi } from "vitest";

vi.mock("../_core/llm", () => ({ invokeLLM: vi.fn() }));

import { factFigures, restoreDroppedFacts } from "./extraction";
import type { Brief } from "./schemas";

const brief = (...claims: string[]): Brief => ({
  roleSummary: "Analyst",
  requirements: [],
  evidence: claims.map((claim, i) => ({ id: `e${i + 1}`, claim, source: "resume", category: "project", verified: true })),
  gaps: [],
  questions: [],
  checklist: [],
});

describe("factFigures", () => {
  it("compares figures across wording and keeps duration units", () => {
    expect(factFigures("blocked it for six weeks")).toEqual(["6 week"]);
    expect(factFigures("a 6-week delay")).toEqual(["6 week"]);
    expect(factFigures("from 3 days to 6 hours")).toEqual(["3 day", "6 hour"]);
    expect(factFigures("rose from 9% to 14% across 1,400 accounts")).toEqual(["9", "14", "1400"]);
    expect(factFigures("no figures here")).toEqual([]);
  });
});

describe("restoreDroppedFacts", () => {
  const resume = "Finance blocked the migration for six weeks until we reconciled GGR.\nReduced review time from 3 days to 6 hours.\nManaged 4 analysts.";

  it("puts a sentence back word for word when its figures were dropped", () => {
    const out = restoreDroppedFacts(brief("Managed four analysts", "Reduced review time from 3 days to 6 hours"), resume);
    expect(out.evidence.map(e => e.claim)).toEqual([
      "Managed four analysts",
      "Reduced review time from 3 days to 6 hours",
      "Finance blocked the migration for six weeks until we reconciled GGR.",
    ]);
    expect(new Set(out.evidence.map(e => e.id)).size).toBe(3);
  });

  it("does not treat a matching number with another unit as kept", () => {
    const out = restoreDroppedFacts(brief("Worked with 3 teams"), "Cut review time to 3 days.");
    expect(out.evidence).toHaveLength(2);
  });

  it("changes nothing when every figure survived or there are none", () => {
    const kept = brief("Blocked for 6 weeks", "3 days to 6 hours", "Led 4 analysts");
    expect(restoreDroppedFacts(kept, resume)).toEqual(kept);
    expect(restoreDroppedFacts(kept, "Strong communicator.")).toEqual(kept);
  });

  it("respects the evidence limit", () => {
    const full = brief(...Array.from({ length: 60 }, (_, i) => `fact ${i}`));
    expect(restoreDroppedFacts(full, "Saved 9000 hours.").evidence).toHaveLength(60);
  });
});
