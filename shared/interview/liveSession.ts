// Pure logic for the live dual-stream interview session.
//
// This is the "brain" of the real-time listening half, deliberately kept free
// of any browser or server API so it can be unit-tested and shared by both
// sides. It answers three questions from a rolling, source-tagged transcript:
//   1. Who said it?            → each segment carries its source stream.
//   2. Is the turn finished?   → a pause after the interviewer's speech.
//   3. Is this new, a repeat,  → token similarity against the last question
//      or a clarification?        we already acted on.
//
// Because capture uses two physically separate streams (candidate mic vs.
// interview tab/system audio), speaker attribution is known by construction —
// no diarization guesswork.

export type LiveSource = "candidate" | "interviewer";

export type TranscriptSegment = {
  id: string;
  source: LiveSource;
  text: string;
  /** Epoch ms when this chunk's audio ended. */
  at: number;
};

export type SuggestionPlan =
  | { ready: false; reason: "no_input" | "speaking" | "duplicate"; question: null }
  | { ready: true; reason: "new" | "refine"; question: string };

export type LivePlanConfig = {
  /** Silence after the interviewer stops before we treat the turn as finished. */
  pauseMs: number;
  /** Gap larger than this starts a new turn rather than extending the current one. */
  turnGapMs: number;
  /** >= this similarity AND not longer ⇒ an echo of what we already answered. */
  dedupeSimilarity: number;
  /** >= this similarity ⇒ a repeat/rephrase of the same question → re-answer with the clearer text. */
  refineSimilarity: number;
};

export const DEFAULT_LIVE_CONFIG: LivePlanConfig = {
  pauseMs: 900,
  turnGapMs: 3500,
  dedupeSimilarity: 0.9,
  refineSimilarity: 0.55,
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Jaccard similarity over token sets — cheap, order-independent, good enough to
// tell a rephrase of the same question from a genuinely new one.
export function tokenSimilarity(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  sa.forEach(t => {
    if (sb.has(t)) inter++;
  });
  const union = sa.size + sb.size - inter;
  return inter / union;
}

// Assemble the interviewer's current question from the trailing run of their
// segments — consecutive segments separated by <= turnGapMs belong to one turn,
// so a question spoken across several chunks (or restated mid-turn) joins up.
export function assembleQuestion(segments: TranscriptSegment[], turnGapMs: number): string {
  const interviewer = segments.filter(s => s.source === "interviewer" && s.text.trim()).sort((x, y) => x.at - y.at);
  if (interviewer.length === 0) return "";
  const run: TranscriptSegment[] = [interviewer[interviewer.length - 1]];
  for (let i = interviewer.length - 2; i >= 0; i--) {
    const gap = run[0].at - interviewer[i].at;
    if (gap <= turnGapMs) run.unshift(interviewer[i]);
    else break;
  }
  return run.map(s => s.text.trim()).join(" ").replace(/\s+/g, " ").trim();
}

// Decide whether — and with what question — to fire a suggestion now.
export function planSuggestion(
  segments: TranscriptSegment[],
  lastSuggestedQuestion: string | null,
  now: number,
  config: LivePlanConfig = DEFAULT_LIVE_CONFIG,
): SuggestionPlan {
  const interviewer = segments.filter(s => s.source === "interviewer" && s.text.trim());
  if (interviewer.length === 0) return { ready: false, reason: "no_input", question: null };

  const lastAt = Math.max(...interviewer.map(s => s.at));
  if (now - lastAt < config.pauseMs) {
    // Still talking (or mid-pause). Wait so we answer the whole question, not a fragment.
    return { ready: false, reason: "speaking", question: null };
  }

  const question = assembleQuestion(segments, config.turnGapMs);
  if (!question) return { ready: false, reason: "no_input", question: null };

  if (lastSuggestedQuestion) {
    const sim = tokenSimilarity(question, lastSuggestedQuestion);
    const longer = question.length > lastSuggestedQuestion.length;
    // An echo of what we already answered, no new information → skip.
    if (sim >= config.dedupeSimilarity && !longer) {
      return { ready: false, reason: "duplicate", question: null };
    }
    // A repeat/rephrase (incl. a clearer re-transcription) → answer again with the better text.
    if (sim >= config.refineSimilarity) {
      return { ready: true, reason: "refine", question };
    }
  }
  return { ready: true, reason: "new", question };
}

// The last few turns, oldest first, as compact context for the answer engine
// so a clarification ("what do you mean by scale?") is understood in context.
export function recentTurns(segments: TranscriptSegment[], limit = 6): Array<{ source: LiveSource; text: string }> {
  return segments
    .filter(s => s.text.trim())
    .slice(-limit)
    .map(s => ({ source: s.source, text: s.text.trim() }));
}
