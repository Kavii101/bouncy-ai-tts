import { useEffect, useRef, useState } from "react";
import { ExternalLink, Mic, Minus, Plus, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useDualStreamCapture, type PartialUtterance, type Utterance } from "@/hooks/useDualStreamCapture";

// Live subtitles: your mic → English transcript → polite Korean caption.
// Meant to be opened as a pop-out window and shared in Teams / Google Meet
// ("share window"), so it works the same on any meeting platform.

type Line = { id: number; en: string; ko: string | null };

const MAX_LINES = 4;

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export default function InterviewSubtitles() {
  const popout = new URLSearchParams(window.location.search).has("popout");
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState<{ en: string; ko: string }>({ en: "", ko: "" });
  const [fontPx, setFontPx] = useState(44);
  const [failure, setFailure] = useState<string | null>(null);

  const transcribe = trpc.interview.live.transcribeSegment.useMutation();
  const translate = trpc.interview.live.translate.useMutation();

  const seqRef = useRef(0);
  const lineIdRef = useRef(0);
  // Bumped on every final so late partial results for a finished utterance are dropped.
  const utteranceRef = useRef(0);
  const partialBusyRef = useRef(false);
  const contextRef = useRef<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const transcribeBlob = async (blob: Blob, mimeType: Utterance["mimeType"], partial: boolean) => {
    const res = await transcribe.mutateAsync({
      source: "candidate",
      audioBase64: await blobToBase64(blob),
      mimeType,
      language: "en",
      seq: seqRef.current++,
      partial,
    });
    return res?.text.trim() ?? "";
  };

  const onPartial = async (p: PartialUtterance) => {
    if (partialBusyRef.current) return;
    partialBusyRef.current = true;
    const utterance = utteranceRef.current;
    try {
      const en = await transcribeBlob(p.blob, p.mimeType, true);
      if (!en || utterance !== utteranceRef.current) return;
      setInterim(prev => ({ en, ko: prev.ko }));
      const res = await translate.mutateAsync({ text: en, context: contextRef.current, partial: true });
      if (utterance !== utteranceRef.current) return;
      setInterim({ en, ko: res?.translation ?? "" });
    } catch {
      /* partials are best-effort; the final carries the line */
    } finally {
      partialBusyRef.current = false;
    }
  };

  const onUtterance = async (u: Utterance) => {
    utteranceRef.current++;
    const id = ++lineIdRef.current;
    try {
      const en = await transcribeBlob(u.blob, u.mimeType, false);
      setInterim({ en: "", ko: "" });
      if (!en) return;
      setLines(prev => [...prev, { id, en, ko: null }].slice(-MAX_LINES));
      const context = contextRef.current;
      contextRef.current = [...context, en].slice(-3);
      const res = await translate.mutateAsync({ text: en, context });
      setLines(prev => prev.map(l => (l.id === id ? { ...l, ko: res?.translation ?? "" } : l)));
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Translation failed. Still listening.");
    }
  };

  const capture = useDualStreamCapture({ onUtterance, onPartial });
  const listening = capture.micState === "listening";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines, interim]);

  const openPopout = () => {
    window.open("/interview/subtitles?popout=1", "interview-subtitles", "popup,width=1100,height=420");
  };

  const clear = () => {
    setLines([]);
    setInterim({ en: "", ko: "" });
    contextRef.current = [];
  };

  return (
    <div className="group flex h-screen flex-col bg-black text-white">
      <div
        className={`flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2 text-sm transition-opacity ${
          popout && listening ? "opacity-0 group-hover:opacity-100" : ""
        }`}
      >
        {listening ? (
          <Button size="sm" variant="destructive" onClick={capture.stop}>
            <Square className="mr-1 h-4 w-4" /> Stop
          </Button>
        ) : (
          <Button size="sm" onClick={() => void capture.startMic()}>
            <Mic className="mr-1 h-4 w-4" /> Start subtitles
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => setFontPx(f => Math.max(24, f - 6))} aria-label="Smaller text">
          <Minus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setFontPx(f => Math.min(96, f + 6))} aria-label="Larger text">
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="secondary" onClick={clear}>
          <Trash2 className="mr-1 h-4 w-4" /> Clear
        </Button>
        {!popout && (
          <Button size="sm" variant="secondary" onClick={openPopout}>
            <ExternalLink className="mr-1 h-4 w-4" /> Pop out
          </Button>
        )}
        <span className="ml-auto text-white/50">
          {listening ? "Listening · English → 한국어" : "Share this window in Teams or Meet, then press Start."}
        </span>
      </div>
      {(capture.error || failure) && <div className="bg-red-900/60 px-4 py-1 text-sm">{capture.error ?? failure}</div>}

      <div className="flex flex-1 flex-col justify-end overflow-hidden px-8 pb-8">
        {lines.map((l, i) => (
          <div key={l.id} className="mt-4" style={{ opacity: 0.4 + (0.6 * (i + 1)) / lines.length }}>
            <p className="font-semibold leading-tight" style={{ fontSize: fontPx }}>
              {l.ko ?? <span className="text-white/40">…</span>}
            </p>
            <p className="mt-1 text-white/60" style={{ fontSize: Math.round(fontPx * 0.4) }}>
              {l.en}
            </p>
          </div>
        ))}
        {interim.en && (
          <div className="mt-4 text-white/70">
            <p className="font-semibold leading-tight" style={{ fontSize: fontPx }}>
              {interim.ko || "…"}
            </p>
            <p className="mt-1 text-white/50" style={{ fontSize: Math.round(fontPx * 0.4) }}>
              {interim.en}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
