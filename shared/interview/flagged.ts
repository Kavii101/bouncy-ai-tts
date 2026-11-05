// Splits answer text so unsupported phrases can be marked where they appear.
// A warning list under the answer is read too late: the candidate is already
// saying the sentence. Phrases that do not appear verbatim are simply not marked.

export type FlaggedPart = { text: string; flagged: boolean };

export function flagPhrases(text: string, phrases: string[]): FlaggedPart[] {
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const phrase of phrases) {
    const needle = phrase.trim().toLowerCase();
    if (needle.length < 4) continue;
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + needle.length)) {
      ranges.push([at, at + needle.length]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);

  const parts: FlaggedPart[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    if (from > cursor) parts.push({ text: text.slice(cursor, from), flagged: false });
    parts.push({ text: text.slice(from, end), flagged: true });
    cursor = end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), flagged: false });
  return parts;
}
