// Cross-window channel for the live answers (teleprompter) page.
//
// The control page (the Live tab) is the only surface that captures audio and
// calls the model. It publishes a stream of messages describing each turn; the
// answers page — opened in a separate window — reduces those messages into a
// view state and renders it big and calm.
//
// Transport is a localStorage snapshot + the `storage` event (see the client
// hooks). This module is pure: message shapes, the reducer, and tolerant
// (de)serialization of the snapshot. Everything here is unit-tested.

export const ANSWERS_STORAGE_KEY = "interview.answers.v1";
export const MAX_HISTORY = 20;

export type ChannelSuggestion = {
  directAnswer: string;
  bullets: string[];
  evidence: Array<{ evidenceId: string; claim: string; verified: boolean }>;
  assumptions: string[];
  followUpQuestion?: string;
  unsupportedClaims: string[];
  confidence: "high" | "medium" | "low";
  shouldVerify: boolean;
};

export type AnswerEntry = ChannelSuggestion & {
  id: string;
  question: string;
  streaming: boolean;
  at: number;
};

export type AnswersState = {
  current: AnswerEntry | null;
  history: AnswerEntry[]; // newest first
  listening: boolean;
  updatedAt: number;
};

export type ChannelMessage =
  | { type: "start"; id: string; question: string; at: number }
  | { type: "stream"; id: string; directAnswer: string; bullets: string[] }
  | { type: "final"; id: string; question: string; suggestion: ChannelSuggestion; at: number }
  | { type: "status"; listening: boolean }
  | { type: "clear" };

export function emptyAnswersState(): AnswersState {
  return { current: null, history: [], listening: false, updatedAt: 0 };
}

function blankEntry(id: string, question: string, at: number): AnswerEntry {
  return {
    id,
    question,
    streaming: true,
    at,
    directAnswer: "",
    bullets: [],
    evidence: [],
    assumptions: [],
    unsupportedClaims: [],
    confidence: "low",
    shouldVerify: true,
  };
}

function pushHistory(history: AnswerEntry[], entry: AnswerEntry | null): AnswerEntry[] {
  if (!entry) return history;
  return [entry, ...history].slice(0, MAX_HISTORY);
}

// Pure reducer. Never mutates its inputs.
export function reduceAnswers(state: AnswersState, msg: ChannelMessage): AnswersState {
  switch (msg.type) {
    case "start": {
      // A new turn begins; roll a finished current into history. One still
      // streaming was abandoned for this turn, so it is a fragment and is dropped.
      const history = state.current && state.current.id !== msg.id && !state.current.streaming ? pushHistory(state.history, state.current) : state.history;
      return { ...state, current: blankEntry(msg.id, msg.question, msg.at), history, updatedAt: msg.at };
    }
    case "stream": {
      const current =
        state.current && state.current.id === msg.id
          ? { ...state.current, directAnswer: msg.directAnswer, bullets: msg.bullets }
          : { ...blankEntry(msg.id, "", Date.now()), directAnswer: msg.directAnswer, bullets: msg.bullets };
      return { ...state, current, updatedAt: Date.now() };
    }
    case "final": {
      const base = state.current && state.current.id === msg.id ? state.current : blankEntry(msg.id, msg.question, msg.at);
      // If we had a DIFFERENT streaming turn, archive it first.
      const history = state.current && state.current.id !== msg.id ? pushHistory(state.history, state.current) : state.history;
      const current: AnswerEntry = {
        ...base,
        ...msg.suggestion,
        id: msg.id,
        question: msg.question || base.question,
        streaming: false,
        at: msg.at,
      };
      return { ...state, current, history, updatedAt: msg.at };
    }
    case "status":
      return { ...state, listening: msg.listening, updatedAt: Date.now() };
    case "clear":
      return { current: null, history: [], listening: state.listening, updatedAt: Date.now() };
    default:
      return state;
  }
}

export function serializeState(state: AnswersState): string {
  return JSON.stringify({ ...state, history: state.history.slice(0, MAX_HISTORY) });
}

// Tolerant: any malformed/partial snapshot yields a clean empty state rather
// than throwing (localStorage can hold stale or corrupted data).
export function deserializeState(raw: string | null | undefined): AnswersState {
  if (!raw) return emptyAnswersState();
  try {
    const parsed = JSON.parse(raw) as Partial<AnswersState>;
    if (!parsed || typeof parsed !== "object") return emptyAnswersState();
    return {
      current: isEntry(parsed.current) ? parsed.current : null,
      history: Array.isArray(parsed.history) ? parsed.history.filter(isEntry).slice(0, MAX_HISTORY) : [],
      listening: Boolean(parsed.listening),
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return emptyAnswersState();
  }
}

function isEntry(value: unknown): value is AnswerEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return typeof e.id === "string" && typeof e.directAnswer === "string" && Array.isArray(e.bullets);
}
