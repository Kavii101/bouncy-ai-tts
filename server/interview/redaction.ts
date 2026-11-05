// Logging + redaction for the Interview Copilot.
//
// Raw candidate text (resume, JD, transcript, answers, SQL prompts) must never
// reach logs, analytics, or error messages. `redact` drops the known
// content-bearing keys and recurses into nested objects/arrays; `interviewLog`
// emits only the redacted, structured metadata.

const SENSITIVE_KEYS = new Set([
  "text",
  "rawtext",
  "normalizedtext",
  "content",
  "answer",
  "answertext",
  "resume",
  "resumetext",
  "jd",
  "jdtext",
  "transcript",
  "prompt",
  "prompttext",
  "sql",
  "schema",
  "schematext",
  "notes",
  "email",
  "bullets",
  "directanswer",
  "explanation",
  "claim",
]);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        out[key] = "[redacted]";
      } else {
        out[key] = redact(val);
      }
    }
    return out;
  }
  return value;
}

export function interviewLog(event: string, data: Record<string, unknown>): void {
  console.info(
    JSON.stringify({
      scope: "interview",
      event,
      at: new Date().toISOString(),
      ...(redact(data) as Record<string, unknown>),
    }),
  );
}
