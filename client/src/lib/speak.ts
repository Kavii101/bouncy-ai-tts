import { pickBestVoice } from "@shared/speechVoice";

// Speak text with the most natural voice the device offers. Returns the
// chosen voice name (for display) or null when synthesis is unavailable.
// Voices load asynchronously in some browsers, so we retry once on
// `voiceschanged` when the first list is empty.
export function speakNaturally(text: string, opts: { lang?: string; rate?: number; onEnd?: () => void } = {}): string | null {
  if (!("speechSynthesis" in window)) return null;
  const lang = opts.lang ?? "en-US";
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = opts.rate ?? 1;
  utter.pitch = 1;
  if (opts.onEnd) {
    utter.onend = opts.onEnd;
    utter.onerror = opts.onEnd;
  }
  const apply = () => {
    const voices = window.speechSynthesis.getVoices();
    const best = pickBestVoice(voices, lang);
    if (best) utter.voice = best;
    return best?.name ?? null;
  };
  const chosen = apply();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
  return chosen;
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function bestVoiceName(lang = "en-US"): string | null {
  if (!("speechSynthesis" in window)) return null;
  return pickBestVoice(window.speechSynthesis.getVoices(), lang)?.name ?? null;
}
