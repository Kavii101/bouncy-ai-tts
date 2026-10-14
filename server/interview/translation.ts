// Live subtitle translation: the candidate's spoken English → polite Korean
// (존댓말) for an on-screen caption the interviewer can read. Plain text in,
// plain text out — no JSON, so a caption can be shown the moment it returns.
import { invokeLLM, type Message } from "../_core/llm";
import { MalformedModelOutput } from "./schemas";

export const SUBTITLE_LANGUAGES = { ko: "Korean" } as const;
export type SubtitleLanguage = keyof typeof SUBTITLE_LANGUAGES;

const TRANSLATE_MAX_TOKENS = 400;

export function buildTranslateMessages(text: string, target: SubtitleLanguage, context: string[] = []): Message[] {
  const language = SUBTITLE_LANGUAGES[target];
  const system = [
    `You translate live spoken English into natural ${language} subtitles for a job interview.`,
    target === "ko" ? "Use polite, respectful speech (존댓말, -요/-습니다 endings) suitable for a first professional meeting." : "",
    "Speech-to-text may contain filler words or small errors: drop fillers and translate the intended meaning.",
    "Keep names, product names and technical terms recognisable; leave acronyms in English.",
    "Reply with the translation only. No quotes, notes, romanisation or explanations.",
  ]
    .filter(Boolean)
    .join("\n");
  const recent = context.slice(-3).filter(s => s.trim());
  const user = recent.length
    ? `Earlier lines (context only, do not translate):\n${recent.join("\n")}\n\nTranslate:\n${text}`
    : `Translate:\n${text}`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function translateSubtitle(params: {
  text: string;
  target: SubtitleLanguage;
  context?: string[];
  model?: string;
}): Promise<{ translation: string; model: string }> {
  const response = await invokeLLM({
    model: params.model,
    messages: buildTranslateMessages(params.text, params.target, params.context),
    maxTokens: TRANSLATE_MAX_TOKENS,
  });
  const content = response.choices[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new MalformedModelOutput();
  return { translation: content.trim().replace(/^["“]|["”]$/g, ""), model: response.model };
}
