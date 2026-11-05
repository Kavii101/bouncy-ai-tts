import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSource } from "@shared/interview/liveSession";

// Dual-stream capture for live interview assist.
//
// Two physically separate sources are captured independently and never mixed:
//   - "candidate"  = your microphone (getUserMedia)
//   - "interviewer" = the shared interview tab / system audio (getDisplayMedia)
// so who is speaking is known by construction.
//
// Each stream is voice-activity gated: we record only while someone is speaking
// and emit ONE utterance-aligned FINAL chunk per turn. During the utterance we
// also emit rolling PARTIAL chunks (everything from the utterance start to now,
// which is a valid standalone file because it includes the container header).
// The caller transcribes partials to show an interim transcript and to act on a
// question the instant the speaker pauses — no post-pause transcription wait.

export type CaptureState = "off" | "listening" | "error";

type SegmentMime = "audio/webm" | "audio/mp4" | "audio/ogg";
export type Utterance = { source: LiveSource; blob: Blob; mimeType: SegmentMime; endedAt: number };
export type PartialUtterance = { source: LiveSource; blob: Blob; mimeType: SegmentMime; seq: number };

export type CaptureHandlers = {
  onUtterance: (u: Utterance) => void;
  onPartial?: (p: PartialUtterance) => void;
};

const START_RMS = 0.025; // begin an utterance above this level
const STOP_RMS = 0.015; // end it once we drop below this…
const SILENCE_MS = 700; // …for this long
const MIN_UTTERANCE_MS = 350; // drop blips shorter than this
const MAX_UTTERANCE_MS = 20_000; // hard cap so one long monologue still flushes
const PARTIAL_MS = 1300; // emit a rolling partial at most this often
const TIMESLICE_MS = 250; // MediaRecorder chunk cadence

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

function baseMime(mimeType: string): SegmentMime {
  if (mimeType.startsWith("audio/mp4")) return "audio/mp4";
  if (mimeType.startsWith("audio/ogg")) return "audio/ogg";
  return "audio/webm";
}

// Attaches VAD-gated recording (with rolling partials) to one audio stream.
// Returns a teardown fn.
function gateStream(
  stream: MediaStream,
  source: LiveSource,
  onUtterance: (u: Utterance) => void,
  onPartial: ((p: PartialUtterance) => void) | undefined,
  onError: (message: string) => void,
): () => void {
  const audioOnly = new MediaStream(stream.getAudioTracks());
  const mimeType = pickMimeType();
  const base = baseMime(mimeType);

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const sourceNode = ctx.createMediaStreamSource(audioOnly);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  sourceNode.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let speaking = false;
  let startedAt = 0;
  let belowSince = 0;
  let stopped = false;
  let partialSeq = 0;
  let lastPartialAt = 0;
  let lastPartialChunks = 0;

  const flush = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const startRecorder = () => {
    chunks = [];
    partialSeq = 0;
    lastPartialAt = 0;
    lastPartialChunks = 0;
    try {
      recorder = new MediaRecorder(audioOnly, { mimeType });
    } catch {
      recorder = new MediaRecorder(audioOnly);
    }
    recorder.ondataavailable = e => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const endedAt = Date.now();
      const duration = endedAt - startedAt;
      const blob = new Blob(chunks, { type: mimeType });
      chunks = [];
      // Don't emit a trailing utterance when the stop came from teardown (Stop
      // button / unmount) rather than a real speech pause.
      if (!stopped && duration >= MIN_UTTERANCE_MS && blob.size > 0) {
        onUtterance({ source, blob, mimeType: base, endedAt });
      }
    };
    recorder.start(TIMESLICE_MS);
    startedAt = Date.now();
  };

  const maybeEmitPartial = (now: number) => {
    if (!onPartial) return;
    if (now - startedAt < PARTIAL_MS) return;
    if (now - lastPartialAt < PARTIAL_MS) return;
    if (chunks.length <= lastPartialChunks || chunks.length === 0) return;
    lastPartialAt = now;
    lastPartialChunks = chunks.length;
    // Snapshot everything so far — valid because chunk[0] carries the header.
    const blob = new Blob(chunks, { type: mimeType });
    onPartial({ source, blob, mimeType: base, seq: partialSeq++ });
  };

  const rms = (): number => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  };

  const tick = window.setInterval(() => {
    if (stopped) return;
    const level = rms();
    const now = Date.now();
    if (!speaking) {
      if (level >= START_RMS) {
        speaking = true;
        belowSince = 0;
        startRecorder();
      }
    } else {
      maybeEmitPartial(now);
      if (now - startedAt >= MAX_UTTERANCE_MS) {
        speaking = false;
        flush();
        return;
      }
      if (level < STOP_RMS) {
        if (belowSince === 0) belowSince = now;
        else if (now - belowSince >= SILENCE_MS) {
          speaking = false;
          belowSince = 0;
          flush();
        }
      } else {
        belowSince = 0;
      }
    }
  }, 100);

  const teardown = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(tick);
    flush();
    try {
      sourceNode.disconnect();
      void ctx.close();
    } catch {
      /* already closed */
    }
    stream.getTracks().forEach(t => t.stop());
  };

  // Fires when the browser ends the stream, e.g. its own "Stop sharing" button.
  stream.getAudioTracks().forEach(t => {
    t.onended = () => {
      teardown();
      onError(source === "interviewer" ? "Sharing stopped. Press Share interview to resume." : "Your microphone stopped. Press My mic to resume.");
    };
  });

  return teardown;
}

export function useDualStreamCapture(handlers: CaptureHandlers) {
  const [micState, setMicState] = useState<CaptureState>("off");
  const [tabState, setTabState] = useState<CaptureState>("off");
  const [tabStream, setTabStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const micTeardown = useRef<(() => void) | null>(null);
  const tabTeardown = useRef<(() => void) | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const emitUtterance = useCallback((u: Utterance) => handlersRef.current.onUtterance(u), []);
  const emitPartial = useCallback((p: PartialUtterance) => handlersRef.current.onPartial?.(p), []);

  const startMic = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("error");
      setError("This browser cannot access the microphone.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micTeardown.current = gateStream(stream, "candidate", emitUtterance, emitPartial, msg => {
        setMicState("off");
        setError(msg);
      });
      setMicState("listening");
    } catch {
      setMicState("error");
      setError("Microphone permission was denied. You can still type.");
    }
  }, [emitUtterance, emitPartial]);

  const startTab = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setTabState("error");
      setError("This browser cannot capture tab audio. Use Chrome and pick a tab with 'Share tab audio'.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach(t => t.stop());
        setTabState("error");
        setError("No audio was shared. Re-share and enable 'Share tab audio'.");
        return;
      }
      // Keep the video track: the Live stage previews the shared interview
      // tab so the candidate can see the interviewer while reading cues.
      setTabStream(stream.getVideoTracks().length ? stream : null);
      tabTeardown.current = gateStream(stream, "interviewer", emitUtterance, emitPartial, msg => {
        setTabState("off");
        setTabStream(null);
        setError(msg);
      });
      setTabState("listening");
    } catch {
      setTabState("error");
      setError("Tab-audio sharing was cancelled.");
    }
  }, [emitUtterance, emitPartial]);

  const stop = useCallback(() => {
    micTeardown.current?.();
    tabTeardown.current?.();
    micTeardown.current = null;
    tabTeardown.current = null;
    setTabStream(null);
    setMicState("off");
    setTabState("off");
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { micState, tabState, tabStream, error, startMic, startTab, stop };
}
