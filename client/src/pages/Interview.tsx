import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Database, FileText, Loader2, Mic, MonitorUp, Radio, Shield, Sparkles, Square, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useDualStreamCapture } from "@/hooks/useDualStreamCapture";
import {
  DEFAULT_LIVE_CONFIG,
  planSuggestion,
  recentTurns,
  type TranscriptSegment,
} from "@shared/interview/liveSession";
import { extractStreamingFields, type StreamingFields } from "@shared/interview/streamingJson";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type LiveSuggestion = inferRouterOutputs<AppRouter>["interview"]["live"]["suggest"]["suggestion"];

const WS = "user";

const MATERIAL_KINDS = [
  { value: "job_description", label: "Job description" },
  { value: "resume", label: "Resume" },
  { value: "project", label: "Project" },
  { value: "notes", label: "Notes" },
] as const;

type MaterialKind = (typeof MATERIAL_KINDS)[number]["value"];

export default function Interview() {
  const config = trpc.interview.config.useQuery();

  if (config.isLoading) {
    return <Centered><Loader2 className="h-5 w-5 animate-spin" /> Loading…</Centered>;
  }
  if (!config.data?.enabled) {
    return (
      <Centered>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Interview Copilot is off</CardTitle>
            <CardDescription>
              This feature is behind a flag. Set <code>INTERVIEW_COPILOT_ENABLED=true</code> on the server to enable it.
            </CardDescription>
          </CardHeader>
        </Card>
      </Centered>
    );
  }

  return <Workspace dialects={config.data.dialects} liveAssistEnabled={config.data.liveAssistEnabled} />;
}

function Workspace({ dialects, liveAssistEnabled }: { dialects: readonly string[]; liveAssistEnabled: boolean }) {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto max-w-5xl px-5 py-8 lg:px-10">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6 text-indigo-600" /> Interview Copilot</h1>
          <p className="mt-1 text-sm text-slate-600">
            Prepare a truthful, evidence-linked brief, practice with feedback, and solve SQL safely. Materials stay in your private workspace.
          </p>
        </header>

        <Tabs defaultValue="setup">
          <TabsList className="mb-4">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="brief">Brief</TabsTrigger>
            <TabsTrigger value="practice">Practice</TabsTrigger>
            <TabsTrigger value="sql">SQL Lab</TabsTrigger>
            {liveAssistEnabled ? <TabsTrigger value="live">Live</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="setup"><SetupTab /></TabsContent>
          <TabsContent value="brief"><BriefTab /></TabsContent>
          <TabsContent value="practice"><PracticeTab /></TabsContent>
          <TabsContent value="sql"><SqlTab dialects={dialects} /></TabsContent>
          {liveAssistEnabled ? <TabsContent value="live"><LiveTab /></TabsContent> : null}
        </Tabs>
      </div>
    </main>
  );
}

// --- Setup -----------------------------------------------------------------

function SetupTab() {
  const utils = trpc.useUtils();
  const [kind, setKind] = useState<MaterialKind>("job_description");
  const [text, setText] = useState("");
  const materials = trpc.interview.materials.list.useQuery({ workspaceId: WS });
  const create = trpc.interview.materials.create.useMutation({
    onSuccess: () => { setText(""); utils.interview.materials.list.invalidate(); },
  });
  const remove = trpc.interview.materials.delete.useMutation({
    onSuccess: () => utils.interview.materials.list.invalidate(),
  });
  const generate = trpc.interview.brief.generate.useMutation({
    onSuccess: () => utils.interview.brief.get.invalidate(),
  });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add material</CardTitle>
          <CardDescription>Paste a job description and your resume. Text is stored privately and used only to build your brief.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={kind} onValueChange={v => setKind(v as MaterialKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATERIAL_KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder="Paste text here…" />
          <Button disabled={!text.trim() || create.isPending} onClick={() => create.mutate({ workspaceId: WS, kind, text })}>
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Add material
          </Button>
          {create.error ? <ErrorNote message={create.error.message} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your materials</CardTitle>
          <CardDescription>Delete removes the stored text. The brief is generated from active materials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {materials.data?.length ? (
            <ul className="space-y-2">
              {materials.data.map(m => (
                <li key={m.materialId} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /> {labelFor(m.kind)} · {m.charCount} chars</span>
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate({ workspaceId: WS, materialId: m.materialId })}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No materials yet.</p>
          )}
          <Button
            variant="secondary"
            disabled={!materials.data?.length || generate.isPending}
            onClick={() => generate.mutate({ workspaceId: WS })}
          >
            {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate brief
          </Button>
          {generate.error ? <ErrorNote message={generate.error.message} /> : null}
          {generate.isSuccess ? <p className="text-sm text-emerald-600">Brief generated — review it in the Brief tab.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Brief -----------------------------------------------------------------

function BriefTab() {
  const utils = trpc.useUtils();
  const briefQuery = trpc.interview.brief.get.useQuery({ workspaceId: WS });
  const approve = trpc.interview.brief.approve.useMutation({
    onSuccess: () => utils.interview.brief.get.invalidate(),
  });

  if (briefQuery.isLoading) return <Loading />;
  const data = briefQuery.data;
  if (!data) return <EmptyNote text="No brief yet. Add materials and generate one in Setup." />;

  const { brief, approved } = data;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Badge variant={approved === "approved" ? "default" : "secondary"}>
          {approved === "approved" ? "Approved" : "Draft — review before use"}
        </Badge>
        {approved !== "approved" ? (
          <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ workspaceId: WS })}>
            {approve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Approve brief
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Role summary</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-700">{brief.roleSummary}</p></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Requirements → evidence</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {brief.requirements.map(r => (
            <div key={r.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={r.category === "must_have" ? "default" : "secondary"}>{r.category === "must_have" ? "Must-have" : "Nice-to-have"}</Badge>
                <Badge variant="outline">{r.priority}</Badge>
                {r.gap ? <Badge variant="destructive">Gap — no evidence</Badge> : null}
                <span>{r.text}</span>
              </div>
              {r.evidenceIds.length ? (
                <p className="mt-1 text-xs text-slate-500">Evidence: {r.evidenceIds.join(", ")}</p>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Evidence</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {brief.evidence.map(e => (
            <div key={e.id} className="flex items-start gap-2 text-sm">
              <Badge variant="outline">{e.id}</Badge>
              <span className={e.verified ? "text-slate-700" : "text-amber-700"}>
                {e.claim} {!e.verified ? <em className="text-xs">(verify before using)</em> : null}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {brief.gaps.length ? (
        <Card>
          <CardHeader><CardTitle className="text-lg">Gaps to address</CardTitle></CardHeader>
          <CardContent><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{brief.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// --- Practice --------------------------------------------------------------

function PracticeTab() {
  const questions = trpc.interview.practice.questions.useQuery({ workspaceId: WS });
  const [selected, setSelected] = useState<{ text: string; category: "behavioral" | "technical" | "product" | "sql" } | null>(null);
  const [answer, setAnswer] = useState("");
  const submit = trpc.interview.practice.submitAnswer.useMutation();

  if (questions.isLoading) return <Loading />;
  if (!questions.data?.approved) return <EmptyNote text="Approve your brief first — practice uses only verified questions." />;

  const feedback = submit.data?.feedback;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Questions</CardTitle>
          <CardDescription>Pick one, type your answer, and get rubric feedback.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {questions.data.questions.map(q => (
            <button
              key={q.id}
              onClick={() => { setSelected({ text: q.text, category: q.category }); setAnswer(""); submit.reset(); }}
              className={`w-full rounded-md border p-2 text-left text-sm ${selected?.text === q.text ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"}`}
            >
              <Badge variant="outline" className="mr-2">{q.category}</Badge>{q.text}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Your answer</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {selected ? <p className="text-sm font-medium text-slate-700">{selected.text}</p> : <p className="text-sm text-slate-500">Select a question.</p>}
          <Textarea rows={7} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer…" disabled={!selected} />
          <Button
            disabled={!selected || !answer.trim() || submit.isPending}
            onClick={() => selected && submit.mutate({ workspaceId: WS, question: selected.text, category: selected.category, answer })}
          >
            {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Get feedback
          </Button>
          {submit.error ? <ErrorNote message={submit.error.message} /> : null}

          {feedback ? (
            <div className="space-y-3 border-t border-slate-200 pt-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {Object.entries(feedback.scores).map(([k, v]) => <Badge key={k} variant="outline">{k}: {v}/5</Badge>)}
              </div>
              <FeedbackList title="Strengths" items={feedback.strengths} />
              <FeedbackList title="Improvements" items={feedback.improvements} />
              {feedback.unsupportedClaims.length ? (
                <div className="rounded-md bg-amber-50 p-2">
                  <p className="font-medium text-amber-800">Unsupported claims — verify before using</p>
                  <ul className="list-disc pl-5 text-amber-800">{feedback.unsupportedClaims.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              ) : null}
              <FeedbackList title="Suggested outline" items={feedback.suggestedOutline} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// --- SQL Lab ---------------------------------------------------------------

function SqlTab({ dialects }: { dialects: readonly string[] }) {
  const [prompt, setPrompt] = useState("");
  const [schema, setSchema] = useState("");
  const [dialect, setDialect] = useState<string>(dialects[0] ?? "generic");
  const generate = trpc.interview.sql.generate.useMutation();
  const result = generate.data;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Database className="h-5 w-5" /> SQL problem</CardTitle>
          <CardDescription>Generation only. Nothing runs against a database — queries are generated and safety-checked.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Dialect</Label>
            <Select value={dialect} onValueChange={setDialect}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{dialects.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Prompt</Label><Textarea rows={4} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. Top 5 customers by revenue in 2026" /></div>
          <div className="space-y-1.5"><Label>Schema (optional)</Label><Textarea rows={5} value={schema} onChange={e => setSchema(e.target.value)} placeholder="CREATE TABLE …" /></div>
          <Button disabled={!prompt.trim() || generate.isPending} onClick={() => generate.mutate({ workspaceId: WS, prompt, dialect: dialect as any, schema: schema || undefined })}>
            {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Generate SQL
          </Button>
          {generate.error ? <ErrorNote message={generate.error.message} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Solution</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {result ? (
            <>
              <Badge variant={result.safety.readOnly ? "default" : "destructive"}>
                {result.safety.readOnly ? "Read-only — safe to review" : `Rejected: ${"reason" in result.safety ? result.safety.reason : ""}`}
              </Badge>
              <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{result.answer.sql}</pre>
              <p className="text-slate-700">{result.answer.explanation}</p>
              <FeedbackList title="Assumptions" items={result.answer.assumptions} />
              <FeedbackList title="Edge cases" items={result.answer.edgeCases} />
              {result.answer.warnings.length ? (
                <div className="rounded-md bg-amber-50 p-2 text-amber-800">
                  <p className="font-medium">Warnings</p>
                  <ul className="list-disc pl-5">{result.answer.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-slate-500">Generate a query to see the solution, explanation, and safety status.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- Live assist -----------------------------------------------------------

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

// Stream a suggestion over SSE. Calls onDelta with the progressively-parsed
// answer text and onFinal with the grounded suggestion. Returns true if a final
// grounded result arrived; false lets the caller fall back to the batch call.
async function streamSuggestion(
  question: string,
  recent: ReturnType<typeof recentTurns>,
  onDelta: (fields: StreamingFields) => void,
  onFinal: (suggestion: LiveSuggestion) => void,
): Promise<boolean> {
  const resp = await fetch("/api/interview/live/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ workspaceId: WS, question, recent }),
  });
  if (!resp.ok || !resp.body) return false;

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let gotFinal = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, "\n"); // tolerate CRLF SSE framing
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      const dataStr = dataLines.join("\n");
      if (!dataStr) continue;
      if (event === "error") return gotFinal;
      let json: { delta?: string; suggestion?: LiveSuggestion };
      try {
        json = JSON.parse(dataStr);
      } catch {
        continue;
      }
      if (event === "final" && json.suggestion) {
        onFinal(json.suggestion);
        gotFinal = true;
      } else if (typeof json.delta === "string") {
        full += json.delta;
        onDelta(extractStreamingFields(full));
      }
    }
  }
  return gotFinal;
}

function LiveTab() {
  const [consent, setConsent] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [suggestion, setSuggestion] = useState<LiveSuggestion | null>(null);
  const [streamPreview, setStreamPreview] = useState<StreamingFields | null>(null);
  const [status, setStatus] = useState<string>("");

  // Interim (in-progress) interviewer transcript from rolling partials.
  const [interim, setInterimState] = useState("");
  const interimRef = useRef("");
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const lastSuggestedRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);
  const partialInFlightRef = useRef(false);

  const transcribe = trpc.interview.live.transcribeSegment.useMutation();
  const suggest = trpc.interview.live.suggest.useMutation();

  const setInterim = (text: string) => {
    interimRef.current = text;
    setInterimState(text);
  };
  const makeSeg = (source: "candidate" | "interviewer", text: string, at: number): TranscriptSegment => ({
    id: `${source}-${at}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    text,
    at,
  });
  const addSegment = (seg: TranscriptSegment) => {
    setSegments(prev => {
      const next = [...prev, seg];
      segmentsRef.current = next;
      return next;
    });
  };
  const updateSegment = (id: string, text: string) => {
    setSegments(prev => {
      const next = prev.map(s => (s.id === id ? { ...s, text } : s));
      segmentsRef.current = next;
      return next;
    });
  };

  const transcribeBlob = async (
    blob: Blob,
    source: "candidate" | "interviewer",
    mimeType: "audio/webm" | "audio/mp4" | "audio/ogg",
    seq: number,
    partial: boolean,
  ): Promise<string> => {
    const audioBase64 = await blobToBase64(blob);
    const res = await transcribe.mutateAsync({ workspaceId: WS, source, audioBase64, mimeType, seq, partial });
    return res.text.trim();
  };

  // Rolling partial → interim interviewer transcript (drops partials while one
  // is already in flight so requests never pile up).
  const handlePartial = async (p: { source: "candidate" | "interviewer"; blob: Blob; mimeType: "audio/webm" | "audio/mp4" | "audio/ogg"; seq: number }) => {
    if (p.source !== "interviewer" || partialInFlightRef.current) return;
    partialInFlightRef.current = true;
    try {
      const text = await transcribeBlob(p.blob, p.source, p.mimeType, p.seq, true);
      if (text) setInterim(text);
    } catch {
      /* partial errors are non-fatal */
    } finally {
      partialInFlightRef.current = false;
    }
  };

  // End of utterance. For the interviewer we optimistically commit the interim
  // text immediately (so the planner can fire without waiting for a fresh
  // transcription), then replace it with the accurate final transcription.
  const handleFinal = async (u: { source: "candidate" | "interviewer"; blob: Blob; mimeType: "audio/webm" | "audio/mp4" | "audio/ogg"; endedAt: number }) => {
    if (u.source === "interviewer") {
      const interimText = interimRef.current;
      let segId: string | null = null;
      if (interimText) {
        const seg = makeSeg("interviewer", interimText, u.endedAt);
        segId = seg.id;
        addSegment(seg);
        setInterim("");
      }
      try {
        const finalText = await transcribeBlob(u.blob, "interviewer", u.mimeType, seqRef.current++, false);
        if (finalText) {
          if (segId) updateSegment(segId, finalText);
          else addSegment(makeSeg("interviewer", finalText, u.endedAt));
        }
      } catch {
        setStatus("A segment could not be transcribed. Still listening.");
      }
      return;
    }
    // Candidate stream: final only (no partials, not used for suggestions).
    try {
      const finalText = await transcribeBlob(u.blob, "candidate", u.mimeType, seqRef.current++, false);
      if (finalText) addSegment(makeSeg("candidate", finalText, u.endedAt));
    } catch {
      /* non-fatal */
    }
  };

  const capture = useDualStreamCapture({ onUtterance: handleFinal, onPartial: handlePartial });

  const listening = capture.micState === "listening" || capture.tabState === "listening";

  const fireSuggest = async (question: string) => {
    inFlightRef.current = true;
    lastSuggestedRef.current = question;
    setSuggestion(null);
    setStreamPreview({ directAnswer: "", bullets: [] });
    const recent = recentTurns(segmentsRef.current);
    try {
      // Fast path: stream tokens for immediate display; finalize with grounding.
      const streamed = await streamSuggestion(
        question,
        recent,
        fields => setStreamPreview(fields),
        final => {
          setSuggestion(final);
          setStreamPreview(null);
        },
      );
      if (!streamed) {
        // Fallback: non-streaming grounded suggestion.
        const res = await suggest.mutateAsync({ workspaceId: WS, question, recent });
        setSuggestion(res.suggestion);
        setStreamPreview(null);
      }
    } catch {
      setStreamPreview(null);
      setStatus("Could not get a suggestion. Check that your brief is approved.");
    } finally {
      inFlightRef.current = false;
    }
  };

  // Auto-suggest: once the interviewer's turn ends (a pause), the tested planner
  // decides whether it's a new question, a repeat/clarification to re-answer, or
  // an echo to skip.
  useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => {
      if (inFlightRef.current) return;
      const plan = planSuggestion(segmentsRef.current, lastSuggestedRef.current, Date.now(), DEFAULT_LIVE_CONFIG);
      if (plan.ready) void fireSuggest(plan.question);
    }, 500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  const clearSession = () => {
    capture.stop();
    setSegments([]);
    segmentsRef.current = [];
    lastSuggestedRef.current = null;
    seqRef.current = 0;
    setInterim("");
    setSuggestion(null);
    setStreamPreview(null);
    setStatus("Session cleared.");
  };

  if (!consent) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Shield className="h-5 w-5" /> Before you start</CardTitle>
          <CardDescription>Live assist listens to two separate streams — your microphone and the interview tab's audio — and shows short grounded suggestions. Capture is manual, visible, and stoppable at any time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={consent} onChange={e => setConsent(e.target.checked)} />
            <span>I confirm I am permitted to use assistive software in this interview and to capture the audio I will share.</span>
          </label>
          <p className="text-slate-500">Your brief must be <strong>approved</strong> for suggestions to work.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Live assist</span>
            {listening ? (
              <span className="flex items-center gap-2 text-sm font-normal text-red-600">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> Listening
              </span>
            ) : (
              <span className="text-sm font-normal text-slate-400">Idle</span>
            )}
          </CardTitle>
          <CardDescription>Start the streams you want. The interviewer stream drives suggestions; your mic is attributed to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant={capture.micState === "listening" ? "secondary" : "default"} size="sm" onClick={() => capture.startMic()} disabled={capture.micState === "listening"}>
              <Mic className="mr-2 h-4 w-4" /> {capture.micState === "listening" ? "Mic on" : "Start my mic"}
            </Button>
            <Button variant={capture.tabState === "listening" ? "secondary" : "default"} size="sm" onClick={() => capture.startTab()} disabled={capture.tabState === "listening"}>
              <MonitorUp className="mr-2 h-4 w-4" /> {capture.tabState === "listening" ? "Tab audio on" : "Share interview audio"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => capture.stop()} disabled={!listening}>
              <Square className="mr-2 h-4 w-4" /> Stop
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSession}>
              <Trash2 className="mr-2 h-4 w-4" /> Clear session
            </Button>
          </div>
          {capture.error ? <ErrorNote message={capture.error} /> : null}
          {status ? <p className="text-xs text-slate-500">{status}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <TranscriptColumn title="You (mic)" source="candidate" segments={segments} />
        <TranscriptColumn title="Interviewer (tab)" source="interviewer" segments={segments} interim={interim} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Radio className="h-5 w-5" /> Suggestion
            {suggest.isPending || streamPreview ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!suggestion && streamPreview ? (
            <div className="space-y-2">
              <p className="font-medium text-slate-800">{streamPreview.directAnswer || <span className="text-slate-400">…</span>}</p>
              {streamPreview.bullets.length ? (
                <ul className="list-disc pl-5 text-slate-600">{streamPreview.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
              ) : null}
              <p className="text-xs text-slate-400">streaming…</p>
            </div>
          ) : suggestion ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={suggestion.confidence === "high" ? "default" : "secondary"}>confidence: {suggestion.confidence}</Badge>
                {suggestion.shouldVerify ? <Badge variant="destructive">verify before using</Badge> : null}
              </div>
              <p className="font-medium text-slate-800">{suggestion.directAnswer}</p>
              <FeedbackList title="Say this" items={suggestion.bullets} />
              {suggestion.evidence.length ? (
                <div>
                  <p className="font-medium text-slate-700">Evidence</p>
                  <ul className="list-disc pl-5 text-slate-600">{suggestion.evidence.map((e, i) => <li key={i}><Badge variant="outline" className="mr-1">{e.evidenceId}</Badge>{e.claim}</li>)}</ul>
                </div>
              ) : null}
              {suggestion.unsupportedClaims.length ? (
                <div className="rounded-md bg-amber-50 p-2 text-amber-800">
                  <p className="font-medium">Not in your evidence — don't state as fact</p>
                  <ul className="list-disc pl-5">{suggestion.unsupportedClaims.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              ) : null}
              {suggestion.followUpQuestion ? <p className="text-slate-500">Clarifying q: {suggestion.followUpQuestion}</p> : null}
            </>
          ) : (
            <p className="text-slate-500">Suggestions appear automatically after the interviewer finishes a question.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TranscriptColumn({ title, source, segments, interim }: { title: string; source: "candidate" | "interviewer"; segments: TranscriptSegment[]; interim?: string }) {
  const rows = segments.filter(s => s.source === source);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">{title}</CardTitle></CardHeader>
      <CardContent className="max-h-56 space-y-1.5 overflow-y-auto text-sm">
        {rows.map(s => <p key={s.id} className="text-slate-700">{s.text}</p>)}
        {interim ? <p className="italic text-slate-400">{interim}…</p> : null}
        {!rows.length && !interim ? <p className="text-slate-400">—</p> : null}
      </CardContent>
    </Card>
  );
}

// --- small helpers ---------------------------------------------------------

function labelFor(kind: string) {
  return MATERIAL_KINDS.find(k => k.value === kind)?.label ?? kind;
}
function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center gap-2 bg-[#f7f8fb] p-6 text-slate-700">{children}</main>;
}
function Loading() {
  return <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
}
function EmptyNote({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-slate-500">{text}</p>;
}
function ErrorNote({ message }: { message: string }) {
  return <p className="flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="h-4 w-4" /> {message}</p>;
}
function FeedbackList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-medium text-slate-700">{title}</p>
      <ul className="list-disc pl-5 text-slate-600">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </div>
  );
}
