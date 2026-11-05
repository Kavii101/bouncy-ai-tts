// Lightweight, dependency-free language detection for live transcript segments.
//
// gpt-4o-transcribe (our default speech model, chosen for accent quality) does
// NOT return a detected-language label, so we infer one from the transcribed
// text itself — no extra API call, no added latency. Two stages:
//   1. Non-Latin scripts are detected by Unicode range (strong, unambiguous).
//   2. Latin-script languages are scored by stop-word frequency.
// This is intentionally a *hint* for a UI badge, not a linguistic classifier;
// answers are always written in English regardless of the detected language.

export type DetectedLanguage = { code: string; label: string };

const SCRIPT_RANGES: Array<{ code: string; label: string; re: RegExp }> = [
  // Kana and Hangul are checked before Han: Japanese/Korean text mixes in Kanji
  // (which lives in the Han range), so a kana/hangul character is the decisive
  // signal and must win over the Chinese range.
  { code: "ja", label: "Japanese", re: /[぀-ヿ]/ },
  { code: "ko", label: "Korean", re: /[가-힯]/ },
  { code: "zh", label: "Chinese", re: /[一-鿿]/ },
  { code: "ar", label: "Arabic", re: /[؀-ۿ]/ },
  { code: "ru", label: "Russian", re: /[Ѐ-ӿ]/ },
  { code: "hi", label: "Hindi", re: /[ऀ-ॿ]/ },
  { code: "he", label: "Hebrew", re: /[֐-׿]/ },
  { code: "el", label: "Greek", re: /[Ͱ-Ͽ]/ },
  { code: "th", label: "Thai", re: /[฀-๿]/ },
];

const LATIN_STOPWORDS: Array<{ code: string; label: string; words: Set<string> }> = [
  { code: "en", label: "English", words: new Set(["the", "and", "is", "are", "you", "to", "of", "in", "that", "have", "for", "what", "how", "with", "your", "about", "tell", "me"]) },
  { code: "es", label: "Spanish", words: new Set(["el", "la", "los", "las", "que", "de", "en", "un", "una", "por", "para", "con", "su", "como", "qué", "es", "está", "tienes", "experiencia", "cuál"]) },
  { code: "fr", label: "French", words: new Set(["le", "la", "les", "des", "un", "une", "que", "et", "en", "est", "vous", "pour", "avec", "dans", "quoi", "comment", "votre", "quelle", "avez"]) },
  { code: "de", label: "German", words: new Set(["der", "die", "das", "und", "ist", "sie", "ein", "eine", "nicht", "mit", "für", "auf", "was", "wie", "haben", "ihre", "welche", "erfahrung"]) },
  { code: "pt", label: "Portuguese", words: new Set(["os", "as", "que", "de", "em", "um", "uma", "por", "para", "com", "você", "como", "está", "não", "qual", "sua", "experiência", "tem"]) },
  { code: "it", label: "Italian", words: new Set(["il", "le", "che", "di", "in", "un", "una", "per", "con", "come", "è", "non", "sono", "hai", "quale", "tua", "esperienza"]) },
];

export function detectLanguage(text: string): DetectedLanguage {
  const trimmed = (text || "").trim();
  if (!trimmed) return { code: "", label: "" };

  // 1) Non-Latin scripts — a single matching character is a confident signal.
  for (const s of SCRIPT_RANGES) {
    if (s.re.test(trimmed)) return { code: s.code, label: s.label };
  }

  // 2) Latin script — score by how many stop-words each language matches.
  const tokens = trimmed.toLowerCase().match(/[a-zàâäáãéèêëíìîïóòôöõúùûüñç]+/g) ?? [];
  if (tokens.length === 0) return { code: "", label: "" };

  let best = { code: "en", label: "English", score: 0 };
  for (const lang of LATIN_STOPWORDS) {
    let score = 0;
    for (const tok of tokens) if (lang.words.has(tok)) score++;
    if (score > best.score) best = { code: lang.code, label: lang.label, score };
  }
  // No stop-word evidence → default to English (the UI/answer language anyway).
  return { code: best.code, label: best.label };
}
