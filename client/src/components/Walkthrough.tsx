import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressTrack } from "@/components/brand";
import { cn } from "@/lib/utils";

// Built-in walkthrough: a lightweight guided tour, no dependencies.
// A card anchored bottom-right walks the user through numbered steps.
// `onStep` lets the host react (e.g. switch tabs) as steps change.
// Seen-state persists per tour id so first-time users get it once,
// and anyone can replay it from a Help / Walkthrough button.

export type WalkStep = {
  title: string;
  body: string;
  /** Kicker shown above the title, e.g. "Step 2 · Brief". */
  kicker?: string;
};

export function useWalkthrough(id: string, autoOpen = false) {
  const key = `bouncy.walkthrough.${id}`;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!autoOpen) return;
    try {
      if (!localStorage.getItem(key)) setOpen(true);
    } catch {
      /* storage unavailable — don't auto-open */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, autoOpen]);
  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [key]);
  const start = useCallback(() => setOpen(true), []);
  return { open, start, close };
}

export function Walkthrough({
  open,
  steps,
  onClose,
  onStep,
  dark = false,
}: {
  open: boolean;
  steps: WalkStep[];
  onClose: () => void;
  onStep?: (index: number) => void;
  dark?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  useEffect(() => {
    if (open) {
      setIndex(0);
      onStep?.(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  const go = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), steps.length - 1);
      setIndex(clamped);
      onStep?.(clamped);
    },
    [onStep, steps.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, go, onClose]);

  if (!open || !step) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Walkthrough">
      <button type="button" aria-label="Close walkthrough" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-x-4 bottom-4 rounded-2xl border p-5 shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px]",
          dark ? "border-white/10 bg-[#121614] text-white" : "border-slate-950/[0.08] bg-white text-slate-950",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className={cn("text-xs font-semibold", dark ? "text-emerald-400" : "text-emerald-600")}>{step.kicker ?? `Step ${index + 1} of ${steps.length}`}</p>
          <button type="button" onClick={onClose} aria-label="Close" className={cn("rounded-md p-1 transition hover:bg-slate-950/5", dark && "hover:bg-white/10")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mt-1.5 text-lg font-semibold tracking-tight">{step.title}</h2>
        <p className={cn("mt-1.5 text-sm leading-6", dark ? "text-slate-300" : "text-slate-600")}>{step.body}</p>
        <ProgressTrack value={(index + 1) / steps.length} className="mt-4" />
        <div className="mt-4 flex items-center gap-1.5">
          <div className="flex gap-1" aria-hidden>
            {steps.map((_, i) => (
              <button key={i} type="button" tabIndex={-1} onClick={() => go(i)} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-emerald-500" : cn("w-1.5", dark ? "bg-white/20" : "bg-slate-950/15"))} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={onClose}>Skip</Button>
            <Button size="sm" variant="outline" disabled={index === 0} onClick={() => go(index - 1)} aria-label="Previous step"><ChevronLeft className="h-4 w-4" /></Button>
            {last ? (
              <Button size="sm" onClick={onClose}>Done</Button>
            ) : (
              <Button size="sm" onClick={() => go(index + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
