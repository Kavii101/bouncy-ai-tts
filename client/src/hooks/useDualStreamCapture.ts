import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSource } from "@shared/interview/liveSession";

// Dual-stream capture for live interview assist.
//
// Two physically separate sources are captured independently and never mixed:
//   - "candidate"  = your microphone (getUserMedia)
//   - "interviewer" = the shared interview tab / system audio (getDisplayMedia)
// so who is speaking is known by construction.
//
// Each stream is voice-activity gated: we watch its RMS level and record only
// while someone is actually speaking, emitting ONE utterance-aligned chunk per
// turn. That keeps transcription calls aligned to speech (cheaper, more
// accurate) and gives clean turn boundaries for the suggestion planner.

export type CaptureState = "off" | "listening" | "error";

type SegmentMime = "audio/webm" | "audio/mp4" | "audio/ogg";
type Utterance = { source: LiveSource; blob: Blob; mimeType: SegmentMime; endedAt: number };

const START_RMS = 0.025; // begin an utterance above this level
const STOP_RMS = 0.015; // end it once we drop below this…
const SILENCE_MS = 700; // …for this long
const MIN_UTTERANCE_MS = 350; // drop blips shorter than this
const MAX_UTTERANCE_MS = 15_000; // hard cap so one long monologue still flushes

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

// Normalize the MediaRecorder mimeType down to the base type the API accepts.
function baseMime(mimeType: string): SegmentMime {
  if (mimeType.startsWith("audio/mp4")) return "audio/mp4";
  if (mimeType.startsWith("audio/ogg")) return "audio/ogg";
  return "audio/webm";
}

// Attaches VAD-gated recording to one audio stream. Returns a teardown fn.
function gateStream(
  stream: MediaStream,
  source: LiveSource,
  onUtterance: (u: Utterance) => void,
  onError: (message: string) => void,
): () => void {
  const audioOnly = new MediaStream(stream.getAudioTracks());
  const mimeType = pickMimeType();

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

  const flush = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const startRecorder = () => {
    chunks = [];
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
      if (duration >= MIN_UTTERANCE_MS && blob.size > 0) {
        onUtterance({ source, blob, mimeType: baseMime(mimeType), endedAt });
      }
    };
    recorder.start();
    startedAt = Date.now();
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

  stream.getAudioTracks().forEach(t => {
    t.onended = () => onError(`${source} audio stopped`);
  });

  return () => {
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
}

export function useDualStreamCapture(onUtterance: (u: Utterance) => void) {
  const [micState, setMicState] = useState<CaptureState>("off");
  const [tabState, setTabState] = useState<CaptureState>("off");
  const [error, setError] = useState<string | null>(null);
  const micTeardown = useRef<(() => void) | null>(null);
  const tabTeardown = useRef<(() => void) | null>(null);
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;

  const emit = useCallback((u: Utterance) => onUtteranceRef.current(u), []);

  const startMic = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState("error");
      setError("This browser cannot access the microphone.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micTeardown.current = gateStream(stream, "candidate", emit, msg => {
        setMicState("off");
        setError(msg);
      });
      setMicState("listening");
    } catch {
      setMicState("error");
      setError("Microphone permission was denied. You can still type.");
    }
  }, [emit]);

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
      // We only need the audio; drop the video track immediately.
      stream.getVideoTracks().forEach(t => t.stop());
      tabTeardown.current = gateStream(stream, "interviewer", emit, msg => {
        setTabState("off");
        setError(msg);
      });
      setTabState("listening");
    } catch {
      setTabState("error");
      setError("Tab-audio sharing was cancelled.");
    }
  }, [emit]);

  const stop = useCallback(() => {
    micTeardown.current?.();
    tabTeardown.current?.();
    micTeardown.current = null;
    tabTeardown.current = null;
    setMicState("off");
    setTabState("off");
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { micState, tabState, error, startMic, startTab, stop };
}
