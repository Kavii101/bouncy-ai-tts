import { EmptyStage, LiveDot } from "@/components/brand";
import { Walkthrough, useWalkthrough } from "@/components/Walkthrough";
import { trpc } from "@/lib/trpc";
import { useAnswersReceiver } from "@/hooks/useAnswersChannel";
import type { AnswerEntry } from "@shared/interview/liveChannel";

// Receive-only "what to say" page, meant to live in a second window/monitor.
// It never captures audio — the Live tab (control window) drives it over a
// cross-window localStorage channel. Big, calm, high-contrast.
export default function InterviewAnswers() {
  const tour = useWalkthrough("answers");
  const config = trpc.interview.config.useQuery();
  const state = useAnswersReceiver();

  if (config.isLoading) {
    return <Shell><p className="text-slate-400">Loading…</p></Shell>;
  }
  if (!config.data?.enabled || !config.data?.liveAssistEnabled) {
    return (
      <Shell>
        <p className="max-w-md text-center text-slate-300">
          Live assist is off. Set <code className="rounded bg-slate-800 px-1">INTERVIEW_COPILOT_ENABLED=true</code> and{" "}
          <code className="rounded bg-slate-800 px-1">INTERVIEW_LIVE_ASSIST_ENABLED=true</code> on the server.
        </p>
      </Shell>
    );
  }

  const { current, history, listening } = state;

  return (
    <main className="stage min-h-screen">
      <div className="mx-auto max-w-3xl px-5 py-6">
        <header className="mb-5 flex items-center justify-between border-b border-slate-800 pb-3">
          <h1 className="text-lg font-semibold tracking-tight">Answers</h1>
          <button type="button" onClick={tour.start} className="ml-3 text-xs font-medium text-slate-400 underline-offset-4 transition hover:text-white hover:underline">How it works</button>
          <LiveDot live={listening} label={listening ? "Listening" : "Idle — start the Live tab"} />
        </header>

        {/* Current answer — the big, glanceable script */}
        <section aria-live="polite" aria-atomic="true" className="min-h-[40vh]">
          {current ? (
            <CurrentAnswer entry={current} />
          ) : (
            <EmptyStage dark title={listening ? "Listening — waiting for the first question." : "Waiting for the control window."} body="Open the Interview Copilot → Live tab and start listening. Answers appear here." />
          )}
        </section>

      <Walkthrough dark open={tour.open} onClose={tour.close} steps={[
        { kicker: "Answers", title: "Your teleprompter for the interview", body: "This window only listens to the control tab — it never captures audio. Keep it on a second screen where only you can see it, and only where assistive tools are permitted." },
        { kicker: "Reading it", title: "Start with the bold line, then the bullets", body: "The big line is your opening sentence. The bullets are supporting points. Anything marked verify is not in your approved evidence — do not state it as fact." },
      ]} />

        {history.length ? (
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Earlier questions</h2>
            <div className="space-y-4">
              {history.map(entry => (
                <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-sm font-medium text-slate-400">{entry.question}</p>
                  <p className="mt-1 text-slate-200">{entry.directAnswer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function CurrentAnswer({ entry }: { entry: AnswerEntry }) {
  return (
    <div className="cue-in">
      {entry.question ? <p className="mb-3 text-base text-slate-400">{entry.question}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {entry.streaming ? <span className="text-xs text-emerald-400">generating…</span> : null}
        {!entry.streaming ? <ConfidencePill confidence={entry.confidence} /> : null}
        {entry.shouldVerify && !entry.streaming ? (
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">verify before stating as fact</span>
        ) : null}
      </div>

      <p className="mt-3 text-2xl font-semibold leading-snug text-white md:text-3xl">
        {entry.directAnswer || <span className="text-slate-600">…</span>}
      </p>

      {entry.bullets.length ? (
        <ul className="mt-5 space-y-3">
          {entry.bullets.map((b, i) => (
            <li key={i} className="flex gap-3 text-lg leading-snug text-slate-100 md:text-xl">
              <span className="mt-1 text-emerald-400">▸</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {entry.unsupportedClaims.length ? (
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <p className="font-semibold">Not in your evidence — don't state as fact:</p>
          <ul className="mt-1 list-disc pl-5">{entry.unsupportedClaims.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      ) : null}

      {entry.evidence.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {entry.evidence.map((e, i) => (
            <span key={i} className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-300" title={e.claim}>
              {e.evidenceId}: {e.claim}
            </span>
          ))}
        </div>
      ) : null}

      {entry.followUpQuestion ? (
        <p className="mt-5 text-sm text-slate-400">Clarify if needed: {entry.followUpQuestion}</p>
      ) : null}
    </div>
  );
}

function ConfidencePill({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const color =
    confidence === "high" ? "bg-emerald-500/20 text-emerald-300" : confidence === "medium" ? "bg-sky-500/20 text-sky-300" : "bg-slate-700 text-slate-300";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>confidence: {confidence}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="stage flex min-h-screen items-center justify-center p-6">{children}</main>;
}
