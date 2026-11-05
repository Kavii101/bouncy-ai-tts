// Speech-following teleprompter engine (pure, unit-tested).
//
// The script (cue cards flattened to sentences) is a word stream. Live ASR
// text is aligned against that stream with a longest-common-subsequence
// score over a search window that starts slightly behind the current
// position and extends ahead — so the prompter follows verbatim reading
// and close paraphrase, jumps forward when the speaker skips ahead, never
// runs backwards, and reports "off course" when nothing matches.

import type { PresentationCue } from "./presentation";

export type ScrollSentence = { index: number; text: string; cueTitle: string; startWord: number };
export type ScrollScript = { sentences: ScrollSentence[]; words: string[] };
export type Alignment = { wordIndex: number; sentenceIndex: number; confidence: number };

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(w => w.length > 0 && /[a-z0-9]/.test(w));
}

export function buildScrollScript(cues: PresentationCue[]): ScrollScript {
  const sentences: ScrollSentence[] = [];
  const words: string[] = [];
  for (const cue of cues) {
    const parts = cue.say.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    for (const text of parts.length ? parts : [cue.say]) {
      const tokens = tokenize(text);
      if (!tokens.length) continue;
      sentences.push({ index: sentences.length, text, cueTitle: cue.title, startWord: words.length });
      words.push(...tokens);
    }
  }
  return { sentences, words };
}

// Returns the LCS length and the window index where its last match lands,
// so the aligned position reflects where the speaker actually ended.
function lcsMatch(a: string[], b: string[]): { length: number; endInB: number } {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  let i = a.length;
  let j = b.length;
  let endInB = -1;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      if (endInB === -1) endInB = j - 1;
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return { length: dp[a.length][b.length], endInB };
}

function sentenceAt(script: ScrollScript, wordIndex: number): number {
  let idx = 0;
  for (const s of script.sentences) {
    if (s.startWord <= wordIndex) idx = s.index;
    else break;
  }
  return idx;
}

export function alignSpeech(spoken: string, script: ScrollScript, fromWord: number): Alignment | null {
  const tail = tokenize(spoken).slice(-12);
  if (tail.length < 3 || script.words.length === 0) return null;
  const start = Math.max(0, fromWord - 15);
  const windowTail = tail.length + 6;
  let best: { p: number; score: number; endInB: number } | null = null;
  for (let p = start; p < script.words.length; p++) {
    const window = script.words.slice(p, p + windowTail);
    const { length: matched, endInB } = lcsMatch(tail, window);
    const distancePenalty = Math.min(0.08, Math.max(0, p - fromWord) / 4000);
    const score = matched / tail.length - distancePenalty;
    if (!best || score > best.score) best = { p, score, endInB };
    if (p - fromWord > 220 && best && best.score > 0.6) break;
  }
  if (!best || best.score < 0.42) return null;
  const wordIndex = Math.min(script.words.length - 1, best.p + Math.max(0, best.endInB));
  return { wordIndex, sentenceIndex: sentenceAt(script, wordIndex), confidence: Math.max(0, Math.min(1, best.score)) };
}

export type FillIn = { kind: "next" | "bridge"; sentence: ScrollSentence; label: string };

// What to show the speaker next: the following sentence when on track, or a
// bridge back to the point just before where they landed when off course.
export function fillInFor(script: ScrollScript, sentenceIndex: number, offCourse: boolean): FillIn | null {
  if (!script.sentences.length) return null;
  if (offCourse) {
    const missed = script.sentences[Math.max(0, sentenceIndex - 1)] ?? script.sentences[0];
    if (!missed) return null;
    return { kind: "bridge", sentence: missed, label: "Bridge back — pick up this point, then continue:" };
  }
  const next = script.sentences[sentenceIndex + 1];
  if (!next) return null;
  return { kind: "next", sentence: next, label: "Coming next:" };
}
