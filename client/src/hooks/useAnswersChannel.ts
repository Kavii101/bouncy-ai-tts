import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANSWERS_STORAGE_KEY,
  type AnswersState,
  type ChannelMessage,
  deserializeState,
  emptyAnswersState,
  reduceAnswers,
  serializeState,
} from "@shared/interview/liveChannel";

const STREAM_WRITE_THROTTLE_MS = 120;

function readSnapshot(): AnswersState {
  try {
    return deserializeState(localStorage.getItem(ANSWERS_STORAGE_KEY));
  } catch {
    return emptyAnswersState();
  }
}

// Control page: reduce messages locally and mirror the snapshot to localStorage.
// A separate answers window picks the snapshot up via the `storage` event.
export function useAnswersPublisher() {
  // Seed from any existing snapshot so a control-page mount/reload continues the
  // session instead of clobbering the answers window's current state + history.
  const stateRef = useRef<AnswersState | null>(null);
  if (stateRef.current === null) stateRef.current = readSnapshot();
  const lastStreamWriteRef = useRef(0);

  const write = useCallback(() => {
    try {
      localStorage.setItem(ANSWERS_STORAGE_KEY, serializeState(stateRef.current!));
    } catch {
      /* localStorage unavailable (private mode, quota) — degrade silently */
    }
  }, []);

  const publish = useCallback(
    (msg: ChannelMessage) => {
      stateRef.current = reduceAnswers(stateRef.current!, msg);
      if (msg.type === "stream") {
        // Throttle high-frequency streaming writes so localStorage isn't thrashed.
        const now = Date.now();
        if (now - lastStreamWriteRef.current < STREAM_WRITE_THROTTLE_MS) return;
        lastStreamWriteRef.current = now;
      }
      write();
    },
    [write],
  );

  const reset = useCallback(() => {
    stateRef.current = reduceAnswers(stateRef.current!, { type: "clear" });
    write();
  }, [write]);

  return { publish, reset };
}

// Answers page: seed from the current snapshot, then update on cross-window
// `storage` events (which fire only in other documents — exactly our case).
export function useAnswersReceiver(): AnswersState {
  const [state, setState] = useState<AnswersState>(() => {
    if (typeof window === "undefined") return emptyAnswersState();
    return readSnapshot();
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ANSWERS_STORAGE_KEY) return;
      setState(deserializeState(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    // Re-read once on mount in case the snapshot changed between render and effect.
    setState(readSnapshot());
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return state;
}
