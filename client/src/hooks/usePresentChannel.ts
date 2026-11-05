import { useCallback, useEffect, useState } from "react";
import {
  PRESENT_STORAGE_KEY,
  type PresentMessage,
  type PresentState,
  deserializePresent,
  emptyPresentState,
  reducePresent,
  serializePresent,
} from "@shared/interview/presentChannel";

function readSnapshot(): PresentState {
  try {
    return deserializePresent(localStorage.getItem(PRESENT_STORAGE_KEY));
  } catch {
    return emptyPresentState();
  }
}

// Both the Present tab (control) and the prompter window use this hook: reads
// seed from localStorage, cross-window updates arrive via `storage` events,
// and every local action is reduced then mirrored back to localStorage.
export function usePresentChannel() {
  const [state, setState] = useState<PresentState>(() => (typeof window === "undefined" ? emptyPresentState() : readSnapshot()));

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PRESENT_STORAGE_KEY) setState(deserializePresent(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    setState(readSnapshot());
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const send = useCallback((msg: PresentMessage) => {
    setState(prev => {
      const next = reducePresent(prev, msg);
      try {
        localStorage.setItem(PRESENT_STORAGE_KEY, serializePresent(next));
      } catch {
        /* localStorage unavailable — same-window state still works */
      }
      return next;
    });
  }, []);

  return { state, send };
}
