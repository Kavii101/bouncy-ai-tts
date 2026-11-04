import { describe, expect, it } from "vitest";
import { chunkScriptLocally, estimateSeconds } from "@shared/interview/presentation";
import {
  deserializePresent,
  emptyPresentState,
  reducePresent,
  serializePresent,
} from "@shared/interview/presentChannel";

describe("estimateSeconds", () => {
  it("scales with word count at speaking pace and has a floor", () => {
    expect(estimateSeconds("")).toBe(0);
    expect(estimateSeconds("hello")).toBeGreaterThanOrEqual(5);
    const words = Array.from({ length: 130 }, () => "word").join(" ");
    expect(estimateSeconds(words)).toBe(60);
  });
});

describe("chunkScriptLocally", () => {
  it("turns paragraphs into cue cards with say text and timing", () => {
    const deck = chunkScriptLocally("My Talk", "Revenue grew this quarter.\n\nNext we ship the roadmap for Q3.");
    expect(deck.title).toBe("My Talk");
    expect(deck.cues).toHaveLength(2);
    expect(deck.cues[0].say).toContain("Revenue grew");
    expect(deck.cues[0].seconds).toBeGreaterThan(0);
    expect(deck.totalSeconds).toBe(deck.cues.reduce((a, c) => a + c.seconds, 0));
    expect(deck.cues.map(c => c.id)).toEqual(["c1", "c2"]);
  });

  it("splits a long paragraph into multiple cues", () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} explains an important point in detail for the audience.`).join(" ");
    const deck = chunkScriptLocally("T", long);
    expect(deck.cues.length).toBeGreaterThan(1);
  });

  it("returns no cues for blank input and rescales to a target duration", () => {
    expect(chunkScriptLocally("T", "   ").cues).toHaveLength(0);
    const deck = chunkScriptLocally("T", "One short point.\n\nAnother short point.", 2);
    expect(Math.abs(deck.totalSeconds - 120)).toBeLessThanOrEqual(2);
  });
});

describe("present channel reducer", () => {
  const deck = chunkScriptLocally("T", "First point.\n\nSecond point.\n\nThird point.");

  it("loads at the first cue and clamps advance/back at the ends", () => {
    let s = reducePresent(emptyPresentState(), { type: "load", deck, at: 1000 });
    expect(s.index).toBe(0);
    s = reducePresent(s, { type: "advance" });
    s = reducePresent(s, { type: "advance" });
    s = reducePresent(s, { type: "advance" });
    expect(s.index).toBe(2);
    s = reducePresent(s, { type: "back" });
    expect(s.index).toBe(1);
    s = reducePresent(s, { type: "goto", index: 99 });
    expect(s.index).toBe(2);
    s = reducePresent(s, { type: "goto", index: -5 });
    expect(s.index).toBe(0);
  });

  it("toggles running and clears the deck", () => {
    let s = reducePresent(emptyPresentState(), { type: "load", deck, at: 1 });
    s = reducePresent(s, { type: "setRunning", running: true });
    expect(s.running).toBe(true);
    s = reducePresent(s, { type: "clear" });
    expect(s.deck).toBeNull();
    expect(s.index).toBe(0);
  });

  it("restart returns to the first cue with a stopped, zeroed timer", () => {
    let s = reducePresent(emptyPresentState(), { type: "load", deck, at: 1 });
    s = reducePresent(s, { type: "advance" });
    s = reducePresent(s, { type: "setRunning", running: true });
    s = reducePresent(s, { type: "restart" });
    expect(s.index).toBe(0);
    expect(s.running).toBe(false);
    expect(s.elapsedMs).toBe(0);
    expect(s.deck).not.toBeNull();
  });

  it("round-trips and tolerates corrupt snapshots", () => {
    const s = reducePresent(emptyPresentState(), { type: "load", deck, at: 7 });
    expect(deserializePresent(serializePresent(s))).toEqual(s);
    expect(deserializePresent("not json")).toEqual(emptyPresentState());
    expect(deserializePresent(null)).toEqual(emptyPresentState());
  });
});
