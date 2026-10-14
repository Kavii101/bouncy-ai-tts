import { useEffect, useRef, useState } from "react";
import { ExternalLink, History, Mic, Minus, Plus, Square, Trash2, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useDualStreamCapture, type PartialUtterance, type Utterance } from "@/hooks/useDualStreamCapture";

// Live subtitles: your mic → English transcript → polite Korean caption.
// Meant to be opened as a pop-out window and shared in Teams / Google Meet
// ("share window"), so it works the same on any meeting platform.
// The page never plays audio: the mic is only transcribed, and the optional
// camera view is video-only and muted, so nothing echoes into the call.

type Line = { id: number; en: string; ko: string | null; shownAt: number | null };

const MAX_LINES = 4; // lines kept in the live view once they've been read
const MAX_HISTORY = 500;

// Minimum time a caption stays on screen before it may roll off: a base
// plus reading time for its length (Korean ~ 8 chars/s, generous for viewers).
export function readTimeMs(ko: string): number {
  return Math.min(15_000, 3_000 + ko.length * 120);
}

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
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camera;
    return () => camera?.getTracks().forEach(t => t.stop());
  }, [camera]);

  const toggleCamera = async () => {
    if (camera) return setCamera(null);
    try {
      setCamera(await navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
    } catch {
      setFailure("Camera permission was denied.");
    }
  };

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
      setLines(prev => [...prev, { id, en, ko: null, shownAt: null }].slice(-MAX_HISTORY));
      const context = contextRef.current;
      contextRef.current = [...context, en].slice(-3);
      const res = await translate.mutateAsync({ text: en, context });
      setLines(prev => prev.map(l => (l.id === id ? { ...l, ko: res?.translation ?? "", shownAt: Date.now() } : l)));
      setFailure(null);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Translation failed. Still listening.");
    }
  };

  const capture = useDualStreamCapture({ onUtterance, onPartial });
  const listening = capture.micState === "listening";

  // Live view: the last few lines, plus any older line not yet on screen long enough to read.
  const visible = showHistory
    ? lines
    : lines.filter(
        (l, i) => i >= lines.length - MAX_LINES || l.shownAt === null || now - l.shownAt < readTimeMs(l.ko ?? ""),
      );

  useEffect(() => {
    if (!showHistory) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [lines, interim, showHistory]);

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
        <Button size="sm" variant="secondary" onClick={() => void toggleCamera()}>
          {camera ? <VideoOff className="mr-1 h-4 w-4" /> : <Video className="mr-1 h-4 w-4" />} Camera
        </Button>
        <Button size="sm" variant={showHistory ? "default" : "secondary"} onClick={() => setShowHistory(h => !h)}>
          <History className="mr-1 h-4 w-4" /> History
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

      {camera && (
        <div className="flex min-h-0 flex-1 justify-center bg-black pt-4">
          <video ref={videoRef} autoPlay muted playsInline className="h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
      <div className={`flex flex-col ${showHistory ? "overflow-y-auto" : "justify-end overflow-hidden"} px-8 pb-8 ${camera ? "max-h-[45%] shrink-0" : "flex-1"}`}>
        {showHistory && <div className="mt-auto" />}
        {visible.map((l, i) => (
          <div key={l.id} className="mt-4" style={{ opacity: showHistory ? 1 : 0.4 + (0.6 * (i + 1)) / visible.length }}>
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
