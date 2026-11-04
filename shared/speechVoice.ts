// Natural-voice selection for device speech synthesis (pure, unit-tested).
// Browsers ship a mix of excellent neural voices and robotic defaults; the
// naive `speechSynthesis.speak` picks the robotic one. This ranks the
// available voices so read-aloud sounds human wherever the platform allows.

export type VoiceLike = { name: string; lang: string };

const ROBOTIC = ["espeak", "microsoft david", "microsoft zira", "microsoft mark", "fred", "albert", "bad news", "bells", "bubbles", "cellos", "hysterical", "pipe organ", "trinoids", "whisper", "zarvox"];

function score(voice: VoiceLike, wantLang: string): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();
  const want = wantLang.toLowerCase();
  const wantBase = want.split("-")[0];
  let s = 0;
  if (lang === want) s += 60;
  else if (lang.startsWith(wantBase)) s += 35;
  else if (wantBase === "en" && lang.startsWith("en")) s += 20;
  else if (lang.startsWith("en")) s += 5;
  if (name.includes("natural")) s += 55;
  if (name.includes("neural")) s += 50;
  if (name.includes("premium")) s += 45;
  if (name.includes("enhanced")) s += 40;
  if (name.includes("google us english")) s += 48;
  if (name.includes("google uk english female")) s += 42;
  if (name.includes("google")) s += 30;
  if (name.includes("aria") || name.includes("jenny") || name.includes("guy")) s += 30;
  if (name.includes("samantha")) s += 32;
  if (name.includes("daniel")) s += 26;
  if (name.includes("alex")) s += 22;
  if (name.includes("serena") || name.includes("kate")) s += 20;
  if (ROBOTIC.some(r => name.includes(r))) s -= 80;
  return s;
}

export function pickBestVoice<T extends VoiceLike>(voices: readonly T[], wantLang = "en-US"): T | null {
  if (!voices.length) return null;
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const voice of voices) {
    const s = score(voice, wantLang);
    if (s > bestScore) {
      bestScore = s;
      best = voice;
    }
  }
  return best;
}
