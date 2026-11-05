// Cross-window channel for the presentation prompter, mirroring liveChannel.
// The Present tab (control) loads a deck; the prompter window renders the
// current cue big and calm. Either window can advance — state syncs through a
// localStorage snapshot + `storage` events. Pure and unit-tested.

import { clampIndex, type PresentationDeck } from "./presentation";

export const PRESENT_STORAGE_KEY = "interview.present.v1";

export type PresentState = {
  deck: PresentationDeck | null;
  index: number;
  running: boolean;
  startedAt: number | null;
  elapsedMs: number;
  /** When the current cue began (while running), and time banked on it before a pause. */
  cueStartedAt: number | null;
  cueElapsedMs: number;
  updatedAt: number;
};

export type PresentMessage =
  | { type: "load"; deck: PresentationDeck; at: number }
  | { type: "advance" }
  | { type: "back" }
  | { type: "goto"; index: number }
  | { type: "setRunning"; running: boolean }
  | { type: "restart" }
  | { type: "clear" };

export function emptyPresentState(): PresentState {
  return { deck: null, index: 0, running: false, startedAt: null, elapsedMs: 0, cueStartedAt: null, cueElapsedMs: 0, updatedAt: 0 };
}

export function cueElapsedSeconds(state: PresentState, now: number): number {
  const live = state.running && state.cueStartedAt ? Math.max(0, now - state.cueStartedAt) : 0;
  return Math.floor((state.cueElapsedMs + live) / 1000);
}

// Moving to a different cue restarts that cue's clock; the total keeps running.
function moveTo(state: PresentState, index: number): PresentState {
  const now = Date.now();
  if (index === state.index) return { ...state, updatedAt: now };
  return { ...state, index, cueElapsedMs: 0, cueStartedAt: state.running ? now : null, updatedAt: now };
}

export function elapsedSeconds(state: PresentState, now: number): number {
  const live = state.running && state.startedAt ? Math.max(0, now - state.startedAt) : 0;
  return Math.floor((state.elapsedMs + live) / 1000);
}

export function reducePresent(state: PresentState, msg: PresentMessage): PresentState {
  const total = state.deck?.cues.length ?? 0;
  switch (msg.type) {
    case "load":
      return { ...emptyPresentState(), deck: msg.deck, updatedAt: msg.at };
    case "advance":
      return moveTo(state, clampIndex(state.index + 1, total));
    case "back":
      return moveTo(state, clampIndex(state.index - 1, total));
    case "goto":
      return moveTo(state, clampIndex(msg.index, total));
    case "setRunning": {
      const now = Date.now();
      if (msg.running) return { ...state, running: true, startedAt: now, cueStartedAt: now, updatedAt: now };
      const live = state.startedAt ? Math.max(0, now - state.startedAt) : 0;
      const cueLive = state.cueStartedAt ? Math.max(0, now - state.cueStartedAt) : 0;
      return { ...state, running: false, startedAt: null, elapsedMs: state.elapsedMs + live, cueStartedAt: null, cueElapsedMs: state.cueElapsedMs + cueLive, updatedAt: now };
    }
    case "restart":
      return { ...emptyPresentState(), deck: state.deck, updatedAt: Date.now() };
    case "clear":
      return emptyPresentState();
    default:
      return state;
  }
}

export function serializePresent(state: PresentState): string {
  return JSON.stringify(state);
}

function isDeck(value: unknown): value is PresentationDeck {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return typeof d.title === "string" && Array.isArray(d.cues) && d.cues.every(c => c && typeof c === "object" && typeof (c as Record<string, unknown>).say === "string");
}

export function deserializePresent(raw: string | null | undefined): PresentState {
  if (!raw) return emptyPresentState();
  try {
    const parsed = JSON.parse(raw) as Partial<PresentState>;
    if (!parsed || typeof parsed !== "object" || !isDeck(parsed.deck ?? null) && parsed.deck !== null) return emptyPresentState();
    const deck = isDeck(parsed.deck) ? parsed.deck : null;
    return {
      deck,
      index: clampIndex(typeof parsed.index === "number" ? parsed.index : 0, deck?.cues.length ?? 0),
      running: Boolean(parsed.running),
      startedAt: typeof parsed.startedAt === "number" ? parsed.startedAt : null,
      elapsedMs: typeof parsed.elapsedMs === "number" ? parsed.elapsedMs : 0,
      cueStartedAt: typeof parsed.cueStartedAt === "number" ? parsed.cueStartedAt : null,
      cueElapsedMs: typeof parsed.cueElapsedMs === "number" ? parsed.cueElapsedMs : 0,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return emptyPresentState();
  }
}
