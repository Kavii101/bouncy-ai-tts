import { describe, expect, it } from "vitest";
import {
  MAX_HISTORY,
  type AnswersState,
  type ChannelSuggestion,
  deserializeState,
  emptyAnswersState,
  reduceAnswers,
  serializeState,
} from "@shared/interview/liveChannel";

const suggestion = (directAnswer: string): ChannelSuggestion => ({
  directAnswer,
  bullets: ["b1", "b2"],
  evidence: [{ evidenceId: "e1", claim: "built X", verified: true }],
  assumptions: [],
  unsupportedClaims: [],
  confidence: "high",
  shouldVerify: false,
});

function apply(state: AnswersState, msgs: Parameters<typeof reduceAnswers>[1][]): AnswersState {
  return msgs.reduce(reduceAnswers, state);
}

describe("reduceAnswers", () => {
  it("start → stream → final builds one current entry without duplicating", () => {
    const state = apply(emptyAnswersState(), [
      { type: "start", id: "t1", question: "Tell me about X", at: 1 },
      { type: "stream", id: "t1", directAnswer: "Lead with", bullets: ["partial"] },
      { type: "final", id: "t1", question: "Tell me about X", suggestion: suggestion("Lead with the dashboard"), at: 2 },
    ]);
    expect(state.current?.id).toBe("t1");
    expect(state.current?.streaming).toBe(false);
    expect(state.current?.directAnswer).toBe("Lead with the dashboard");
    expect(state.history).toHaveLength(0);
  });

  it("a new turn archives the previous one, newest first", () => {
    const state = apply(emptyAnswersState(), [
      { type: "start", id: "t1", question: "Q1", at: 1 },
      { type: "final", id: "t1", question: "Q1", suggestion: suggestion("A1"), at: 2 },
      { type: "start", id: "t2", question: "Q2", at: 3 },
      { type: "final", id: "t2", question: "Q2", suggestion: suggestion("A2"), at: 4 },
    ]);
    expect(state.current?.question).toBe("Q2");
    expect(state.history.map(h => h.question)).toEqual(["Q1"]);
  });

  it("reflects streaming text live before final arrives", () => {
    const state = apply(emptyAnswersState(), [
      { type: "start", id: "t1", question: "Q", at: 1 },
      { type: "stream", id: "t1", directAnswer: "half", bullets: ["one"] },
    ]);
    expect(state.current?.streaming).toBe(true);
    expect(state.current?.directAnswer).toBe("half");
    expect(state.current?.bullets).toEqual(["one"]);
  });

  it("caps history at MAX_HISTORY", () => {
    let state = emptyAnswersState();
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      state = apply(state, [
        { type: "start", id: `t${i}`, question: `Q${i}`, at: i },
        { type: "final", id: `t${i}`, question: `Q${i}`, suggestion: suggestion(`A${i}`), at: i },
      ]);
    }
    // current holds the latest; history holds the previous MAX_HISTORY.
    expect(state.history).toHaveLength(MAX_HISTORY);
    expect(state.current?.question).toBe(`Q${MAX_HISTORY + 4}`);
  });

  it("status updates listening without touching entries", () => {
    const state = apply(emptyAnswersState(), [
      { type: "start", id: "t1", question: "Q", at: 1 },
      { type: "status", listening: true },
    ]);
    expect(state.listening).toBe(true);
    expect(state.current?.id).toBe("t1");
  });

  it("clear wipes current and history but keeps listening", () => {
    const state = apply(emptyAnswersState(), [
      { type: "status", listening: true },
      { type: "start", id: "t1", question: "Q", at: 1 },
      { type: "final", id: "t1", question: "Q", suggestion: suggestion("A"), at: 2 },
      { type: "clear" },
    ]);
    expect(state.current).toBeNull();
    expect(state.history).toHaveLength(0);
    expect(state.listening).toBe(true);
  });

  it("final without a matching start still shows an answer", () => {
    const state = apply(emptyAnswersState(), [
      { type: "final", id: "orphan", question: "Q", suggestion: suggestion("A"), at: 1 },
    ]);
    expect(state.current?.directAnswer).toBe("A");
    expect(state.current?.streaming).toBe(false);
  });
});

describe("snapshot (de)serialization", () => {
  it("round-trips a populated state", () => {
    const state = apply(emptyAnswersState(), [
      { type: "start", id: "t1", question: "Q", at: 1 },
      { type: "final", id: "t1", question: "Q", suggestion: suggestion("A"), at: 2 },
    ]);
    expect(deserializeState(serializeState(state))).toEqual(state);
  });

  it("returns empty state for null/garbage/corrupt input", () => {
    expect(deserializeState(null)).toEqual(emptyAnswersState());
    expect(deserializeState("not json")).toEqual(emptyAnswersState());
    expect(deserializeState('{"history": 42}')).toEqual(emptyAnswersState());
  });

  it("drops malformed history entries", () => {
    const raw = JSON.stringify({ current: null, history: [{ id: "ok", directAnswer: "a", bullets: [] }, { nope: true }], listening: false, updatedAt: 0 });
    expect(deserializeState(raw).history).toHaveLength(1);
  });
});
