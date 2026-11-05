// Tolerant extraction of the two human-facing fields (directAnswer, bullets)
// from a PARTIAL JSON string as it streams in. The model emits a structured
// JSON suggestion; we want to show the answer text the instant it starts
// arriving, before the whole object is valid. Pure and order-independent — it
// locates fields by key name wherever they appear.
//
// This is display-only. The authoritative, grounded suggestion is still parsed
// and validated from the COMPLETE JSON server-side.

export type StreamingFields = { directAnswer: string; bullets: string[] };

type ReadResult = { value: string; end: number; closed: boolean };

// Read a JSON string literal starting at the opening quote index. Tolerates an
// unterminated string (stream not finished) by returning what exists so far.
function readString(s: string, openQuote: number): ReadResult {
  let out = "";
  let i = openQuote + 1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\") {
      const next = s[i + 1];
      if (next === undefined) return { value: out, end: s.length, closed: false };
      switch (next) {
        case "n": out += "\n"; break;
        case "t": out += "\t"; break;
        case "r": out += "\r"; break;
        case '"': out += '"'; break;
        case "\\": out += "\\"; break;
        case "/": out += "/"; break;
        default: out += next;
      }
      i += 2;
      continue;
    }
    if (ch === '"') return { value: out, end: i + 1, closed: true };
    out += ch;
    i++;
  }
  return { value: out, end: s.length, closed: false };
}

function extractString(partial: string, key: string): string | undefined {
  const keyIdx = partial.indexOf(`"${key}"`);
  if (keyIdx === -1) return undefined;
  const colon = partial.indexOf(":", keyIdx + key.length + 2);
  if (colon === -1) return undefined;
  const quote = partial.indexOf('"', colon + 1);
  if (quote === -1) return undefined;
  return readString(partial, quote).value;
}

function extractStringArray(partial: string, key: string): string[] {
  const keyIdx = partial.indexOf(`"${key}"`);
  if (keyIdx === -1) return [];
  const open = partial.indexOf("[", keyIdx + key.length + 2);
  if (open === -1) return [];
  const items: string[] = [];
  let i = open + 1;
  while (i < partial.length) {
    const ch = partial[i];
    if (ch === "]") break;
    if (ch === '"') {
      const r = readString(partial, i);
      items.push(r.value);
      if (!r.closed) break; // stream ended mid-item
      i = r.end;
      continue;
    }
    i++; // whitespace / comma
  }
  return items;
}

export function extractStreamingFields(partial: string): StreamingFields {
  return {
    directAnswer: extractString(partial, "directAnswer") ?? "",
    bullets: extractStringArray(partial, "bullets"),
  };
}
