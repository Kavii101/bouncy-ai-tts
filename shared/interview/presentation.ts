// Presentation cue cards: pure helpers shared by server and client.
// A deck is a talk script chunked into glanceable cues — what to say, how to
// transition out, and a time budget per cue. The local chunker is the
// deterministic fallback when no LLM is available; it never invents text.

export type PresentationCue = {
  id: string;
  title: string;
  say: string;
  transition: string;
  seconds: number;
  notes: string;
};

export type PresentationDeck = {
  title: string;
  cues: PresentationCue[];
  totalSeconds: number;
};

const WORDS_PER_MINUTE = 130;
const MIN_CUE_SECONDS = 5;
const MAX_CHUNK_CHARS = 600;

export function estimateSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 0;
  return Math.max(MIN_CUE_SECONDS, Math.round((words / WORDS_PER_MINUTE) * 60));
}

function cueTitle(text: string, index: number): string {
  const first = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? "";
  if (first && first.length <= 60) return first.replace(/[.!?]+$/, "");
  const words = text.trim().split(/\s+/).slice(0, 7).join(" ");
  return words ? `${words}…` : `Part ${index + 1}`;
}

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHUNK_CHARS) return [paragraph];
  const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current + " " + sentence).length > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [paragraph];
}

export function chunkScriptLocally(title: string, script: string, targetMinutes?: number): PresentationDeck {
  const paragraphs = script.replace(/\r\n/g, "\n").split(/\n\s*\n/).map(p => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const texts = paragraphs.flatMap(splitLongParagraph);
  const cues: PresentationCue[] = texts.map((say, i) => ({
    id: `c${i + 1}`,
    title: cueTitle(say, i),
    say,
    transition: i < texts.length - 1 ? "Pause, then move to the next point." : "Wrap up and invite questions.",
    seconds: estimateSeconds(say),
    notes: "",
  }));
  if (targetMinutes && targetMinutes > 0 && cues.length) {
    const target = Math.round(targetMinutes * 60);
    const raw = cues.reduce((a, c) => a + c.seconds, 0) || 1;
    let assigned = 0;
    cues.forEach((cue, i) => {
      cue.seconds = i === cues.length - 1 ? Math.max(MIN_CUE_SECONDS, target - assigned) : Math.max(MIN_CUE_SECONDS, Math.round((cue.seconds / raw) * target));
      assigned += cue.seconds;
    });
  }
  return { title: title.trim() || "Untitled talk", cues, totalSeconds: cues.reduce((a, c) => a + c.seconds, 0) };
}

export function clampIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index) || 0, 0), total - 1);
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
