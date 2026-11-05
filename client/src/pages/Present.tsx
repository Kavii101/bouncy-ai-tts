import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic, Pause, Play, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, Mascot, ProgressTrack } from "@/components/brand";
import { Walkthrough, useWalkthrough } from "@/components/Walkthrough";
import { usePresentChannel } from "@/hooks/usePresentChannel";
import { useDualStreamCapture, type PartialUtterance, type Utterance } from "@/hooks/useDualStreamCapture";
import { trpc } from "@/lib/trpc";
import { alignSpeech, buildScrollScript, fillInFor } from "@shared/interview/scrollFollow";
import type { PresentationDeck } from "@shared/interview/presentation";
import { cueElapsedSeconds, elapsedSeconds } from "@shared/interview/presentChannel";
import { formatClock } from "@shared/interview/presentation";

// Full-screen presentation prompter. Shows the current cue large, the next cue
// small, a timer against the cue budget, and progress. Advance with Space /
// ArrowRight / tap on the right side; go back with ArrowLeft / left side.
// The Present tab in /interview is the control surface that loads the deck.
export default function Present() {
  const { state, send } = usePresentChannel();
  const tour = useWalkthrough("present");
  const [now, setNow] = useState(() => Date.now());
  const [fontPx, setFontPx] = useState(40);
  const [mode, setMode] = useState<"cards" | "scroll">("cards");

  useEffect(() => {
    if (!state.running) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [state.running]);

  const deck = state.deck;
  const cue = deck?.cues[state.index] ?? null;
  const next = deck?.cues[state.index + 1] ?? null;
  const elapsed = elapsedSeconds(state, now);
  const cueElapsed = cueElapsedSeconds(state, now);
  const overBudget = cue ? cueElapsed > cue.seconds : false;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tour.open) return; // the walkthrough owns the arrow keys while it is up
      if (e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        send({ type: "advance" });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        send({ type: "back" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send, tour.open]);

  if (!deck || !cue) {
    return (
      <main className="stage flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <Mascot pose="welcome" className="mx-auto mb-5 h-44 w-40" />
          <p className="text-xl">No talk loaded yet.</p>
          <p className="mt-2 text-sm text-slate-400">Open Interview Copilot → Present, paste your script, generate cue cards, then open this prompter.</p>
        </div>
      </main>
    );
  }

  if (mode === "scroll") return <ScrollPrompter deck={deck} onExit={() => setMode("cards")} />;

  return (
    <main className="stage flex min-h-screen flex-col" aria-live="polite">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-5 py-3">
        <span className="font-semibold">{deck.title}</span>
        <span className="text-sm text-slate-400">
          Cue {state.index + 1} of {deck.cues.length} · <span className="tnum">{formatClock(elapsed)} / {formatClock(deck.totalSeconds)}</span>
        </span>
        <span className={`ml-2 text-sm ${overBudget ? "font-semibold text-red-400" : "text-slate-400"}`}>
          This cue: <span className="tnum">{formatClock(cueElapsed)} / {formatClock(cue.seconds)}</span>{overBudget ? " — wrap up" : ""}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setFontPx(f => Math.max(24, f - 4))} aria-label="Smaller text">A−</Button>
          <Button size="sm" variant="secondary" onClick={() => setFontPx(f => Math.min(84, f + 4))} aria-label="Larger text">A+</Button>
          {state.running ? (
            <Button size="sm" variant="secondary" onClick={() => send({ type: "setRunning", running: false })}><Pause className="mr-1 h-4 w-4" /> Pause</Button>
          ) : (
            <Button size="sm" onClick={() => { setNow(Date.now()); send({ type: "setRunning", running: true }); }}><Play className="mr-1 h-4 w-4" /> {elapsed ? "Resume" : "Start timer"}</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => send({ type: "restart" })}><RotateCcw className="mr-1 h-4 w-4" /> Restart</Button>
          <Button size="sm" variant="ghost" onClick={tour.start}>Help</Button>
          <Button size="sm" onClick={() => setMode("scroll")}><Mic className="mr-1 h-4 w-4" /> Live scroll</Button>
        </div>
      </header>

      <ProgressTrack value={(state.index + 1) / deck.cues.length} className="rounded-none" />

      <section key={cue.id} className="cue-in relative flex flex-1 flex-col justify-center px-8 py-8 md:px-16">
        <button type="button" aria-label="Previous cue" className="absolute inset-y-0 left-0 w-[18%] cursor-w-resize opacity-0" onClick={() => send({ type: "back" })} />
        <button type="button" aria-label="Next cue" className="absolute inset-y-0 right-0 w-[18%] cursor-e-resize opacity-0" onClick={() => send({ type: "advance" })} />
        <p className="text-sm font-medium uppercase tracking-wide text-slate-400">{cue.title}</p>
        <p className="mt-4 font-semibold leading-tight text-white" style={{ fontSize: fontPx }}>{cue.say}</p>
        {cue.notes ? <p className="mt-5 max-w-3xl text-base text-slate-300">{cue.notes}</p> : null}
        {cue.transition ? <p className="mt-5 text-base text-slate-400">→ {cue.transition}</p> : null}
      </section>

      <footer className="border-t border-slate-800 px-8 py-4 md:px-16">
        {next ? (
          <p className="text-slate-400"><span className="text-xs font-semibold uppercase tracking-wide">Next: {next.title} · </span>{next.say}</p>
        ) : (
          <p className="text-slate-400">Last cue — wrap up and invite questions.</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="secondary" onClick={() => send({ type: "back" })} disabled={state.index === 0}><ChevronLeft className="mr-1 h-4 w-4" /> Back</Button>
          <Button onClick={() => send({ type: "advance" })} disabled={state.index >= deck.cues.length - 1}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
          <span className="ml-2 hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex"><Kbd>Space</Kbd> next <Kbd>←</Kbd> back</span>
        </div>
      </footer>
      <Walkthrough dark open={tour.open} onClose={tour.close} steps={[
        { kicker: "Prompter", title: "One cue at a time", body: "The big text is what to say now. The next cue waits at the bottom so you always know where the talk goes next." },
        { kicker: "Controls", title: "Advance without looking down", body: "Press Space or the right arrow, click the right edge of the screen, or use Next. Left arrow goes back. The control tab can drive it too — both windows stay in sync." },
        { kicker: "Pace", title: "Stay on time", body: "Start the timer when you begin. Each cue has a budget; if you run over, the header tells you to wrap up. Pause any time." },
        { kicker: "Live scroll", title: "Or let it follow your voice", body: "In Live scroll, the prompter listens and scrolls to what you actually say. Stop talking and it holds. Drift off and it offers a bridge line back. Click any line to jump." },
      ]} />
    </main>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// Live Scroll: the speech-following teleprompter. Your mic is transcribed in
// rolling chunks; each transcript is aligned against the script word stream
// (shared/interview/scrollFollow) and the scroll moves to where you are.
// Silence holds the scroll. Unmatched speech flags off-course and offers a
// bridge line back. Clicking any sentence jumps there manually.
function ScrollPrompter({ deck, onExit }: { deck: PresentationDeck; onExit: () => void }) {
  const script = useMemo(() => buildScrollScript(deck.cues), [deck]);
  const [sentence, setSentence] = useState(0);
  const [offCourse, setOffCourse] = useState(false);
  const [heard, setHeard] = useState("");
  const [fontPx, setFontPx] = useState(34);
  const [now, setNow] = useState(() => Date.now());
  const sentenceRef = useRef(0);
  const wordRef = useRef(0);
  const missesRef = useRef(0);
  const lastHeardRef = useRef(0);
  const partialBusy = useRef(false);
  const seqRef = useRef(0);
  const itemRefs = useRef(new Map<number, HTMLParagraphElement>());
  const transcribe = trpc.interview.live.transcribeSegment.useMutation();

  const applyAlignment = (text: string, final: boolean) => {
    if (!text.trim()) return;
    setHeard(text);
    lastHeardRef.current = Date.now();
    const hit = alignSpeech(text, script, wordRef.current);
    if (hit) {
      missesRef.current = 0;
      setOffCourse(false);
      wordRef.current = hit.wordIndex;
      if (hit.sentenceIndex !== sentenceRef.current) {
        sentenceRef.current = hit.sentenceIndex;
        setSentence(hit.sentenceIndex);
      }
    } else if (final) {
      missesRef.current += 1;
      if (missesRef.current >= 1) setOffCourse(true);
    }
  };

  const transcribeBlob = async (blob: Blob, mimeType: Utterance["mimeType"], partial: boolean) => {
    const res = await transcribe.mutateAsync({ source: "candidate", audioBase64: await blobToBase64(blob), mimeType, language: "en", seq: seqRef.current++, partial });
    return res?.text.trim() ?? "";
  };
  const onPartial = async (p: PartialUtterance) => {
    if (partialBusy.current) return;
    partialBusy.current = true;
    try { applyAlignment(await transcribeBlob(p.blob, p.mimeType, true), false); } catch { /* partials are best-effort */ } finally { partialBusy.current = false; }
  };
  const onUtterance = async (u: Utterance) => {
    try { applyAlignment(await transcribeBlob(u.blob, u.mimeType, false), true); } catch { /* keep scroll where it is */ }
  };
  const capture = useDualStreamCapture({ onUtterance, onPartial });
  const listening = capture.micState === "listening";
  const paused = listening && lastHeardRef.current > 0 && now - lastHeardRef.current > 2500 && sentence > 0;

  useEffect(() => {
    if (!listening) return;
    const t = window.setInterval(() => setNow(Date.now()), 600);
    return () => window.clearInterval(t);
  }, [listening]);

  useEffect(() => {
    itemRefs.current.get(sentence)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [sentence]);

  const jump = (index: number) => {
    const clamped = Math.min(Math.max(index, 0), script.sentences.length - 1);
    const target = script.sentences[clamped];
    if (!target) return;
    sentenceRef.current = clamped;
    wordRef.current = target.startWord;
    missesRef.current = 0;
    setOffCourse(false);
    setSentence(clamped);
  };

  const fill = fillInFor(script, sentence, offCourse);

  return (
    <main className="stage flex min-h-screen flex-col" aria-live="polite">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-5 py-3">
        <span className="font-semibold">{deck.title}</span>
        <span className={`inline-flex items-center gap-2 text-xs font-medium ${offCourse ? "text-amber-400" : listening ? "text-emerald-400" : "text-slate-400"}`}>
          <span className={`size-2 rounded-full ${listening && !offCourse ? "animate-pulse bg-emerald-400" : offCourse ? "bg-amber-400" : "bg-slate-600"}`} />
          {offCourse ? "Off course — bridge below" : listening ? (paused ? "Paused — holding your place" : "Following your voice") : "Live scroll ready"}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setFontPx(f => Math.max(22, f - 3))} aria-label="Smaller text">A−</Button>
          <Button size="sm" variant="secondary" onClick={() => setFontPx(f => Math.min(64, f + 3))} aria-label="Larger text">A+</Button>
          {listening ? (
            <Button size="sm" variant="destructive" onClick={capture.stop}><Square className="mr-1 h-4 w-4" /> Stop</Button>
          ) : (
            <Button size="sm" onClick={() => void capture.startMic()}><Mic className="mr-1 h-4 w-4" /> Follow my voice</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onExit}>Cue cards</Button>
        </div>
      </header>
      <ProgressTrack value={script.sentences.length ? (sentence + 1) / script.sentences.length : 0} className="rounded-none" />
      {capture.error ? <p className="bg-red-900/60 px-5 py-1.5 text-sm">{capture.error} You can still click any sentence to move manually.</p> : null}

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-10">
        {script.sentences.map(s => {
          const distance = Math.abs(s.index - sentence);
          return (
            <p
              key={s.index}
              ref={el => { if (el) itemRefs.current.set(s.index, el); }}
              onClick={() => jump(s.index)}
              className={`mb-5 cursor-pointer rounded-xl px-4 py-3 font-medium leading-snug transition-all ${s.index === sentence ? "bg-white/[0.09] text-white" : distance <= 1 ? "text-slate-300" : "text-slate-500"}`}
              style={{ fontSize: s.index === sentence ? fontPx : Math.round(fontPx * 0.72), opacity: s.index === sentence ? 1 : Math.max(0.35, 0.85 - distance * 0.15) }}
            >
              {s.index === sentence ? <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-emerald-400">{s.cueTitle}</span> : null}
              {s.text}
            </p>
          );
        })}
        {!script.sentences.length ? <p className="text-slate-400">This deck has no speakable text.</p> : null}
      </div>

      <footer className="border-t border-slate-800 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          {heard ? <p className="mb-2 truncate text-xs text-slate-500">Heard: “{heard}”</p> : null}
          {fill ? (
            <div className={`rounded-xl px-4 py-3 ${fill.kind === "bridge" ? "bg-amber-500/15 text-amber-100" : "bg-white/[0.06] text-slate-200"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">{fill.label}</p>
              <p className="mt-1 text-base font-medium">{fill.sentence.text}</p>
            </div>
          ) : <p className="text-sm text-slate-400">End of script — wrap up and invite questions.</p>}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={sentence === 0} onClick={() => jump(sentence - 1)}>Back</Button>
            <Button size="sm" disabled={sentence >= script.sentences.length - 1} onClick={() => jump(sentence + 1)}>Next sentence</Button>
            <span className="ml-2 hidden text-xs text-slate-500 sm:inline">Speak and the scroll follows · stop speaking and it holds · click any line to jump</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
