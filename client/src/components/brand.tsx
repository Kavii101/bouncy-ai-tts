import { Link } from "wouter";
import { cn } from "@/lib/utils";

// Shared brand micro-components. One visual language across Home, Interview,
// and the dark prompter stages. No new dependencies.

export function Wordmark({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label="BountyAI home">
      <img src="/mascot/M-P19-crop.jpg" alt="" className="size-9 shrink-0 rounded-full border border-slate-950/10 object-cover object-[50%_8%] shadow-sm transition-transform group-hover:-translate-y-px" />
      <span className="leading-tight">
        <span className={cn("block text-[15px] font-semibold tracking-tight", dark ? "text-white" : "text-slate-950")}>BountyAI</span>
        <span className={cn("block text-[11px] font-medium", dark ? "text-slate-400" : "text-slate-500")}>Online co-pilot</span>
      </span>
    </Link>
  );
}

export const MASCOT = {
  welcome: "/mascot/M-P09-crop.jpg",
  evidence: "/mascot/M-P11-crop.jpg",
  approve: "/mascot/M-P19-crop.jpg",
  present: "/mascot/M-S2-crop.jpg",
} as const;

export function Mascot({ pose, className, alt = "Bounty meerkat mascot" }: { pose: keyof typeof MASCOT; className?: string; alt?: string }) {
  return <img src={MASCOT[pose]} alt={alt} className={cn("rounded-2xl border border-slate-950/[0.07] object-cover object-top shadow-sm", className)} loading="lazy" />;
}

export function TopBar({ dark = false, right }: { dark?: boolean; right?: React.ReactNode }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-md",
        dark ? "border-white/10 bg-[#0b0e0d]/85" : "border-slate-950/[0.07] bg-[#fbfcfb]/85",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Wordmark dark={dark} />
        {right}
      </div>
    </header>
  );
}

export function LiveDot({ live, label }: { live: boolean; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-medium", live ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400")} role="status">
      <span className={cn("size-2 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")} />
      {label ?? (live ? "Live" : "Idle")}
    </span>
  );
}

export function ProgressTrack({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-slate-950/[0.07] dark:bg-white/10", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-950/10 bg-white px-1 font-sans text-[11px] font-medium text-slate-500 shadow-[0_1px_0_rgba(0,0,0,0.06)] dark:border-white/15 dark:bg-white/10 dark:text-slate-300">
      {children}
    </kbd>
  );
}

export function EmptyStage({ title, body, dark = false }: { title: string; body: string; dark?: boolean }) {
  return (
    <div className="flex min-h-[38vh] flex-col items-center justify-center px-6 text-center">
      <p className={cn("text-xl font-semibold tracking-tight", dark ? "text-white" : "text-slate-900")}>{title}</p>
      <p className={cn("mt-2 max-w-sm text-sm leading-6", dark ? "text-slate-400" : "text-slate-500")}>{body}</p>
    </div>
  );
}
