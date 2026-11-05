import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Database, ExternalLink, FileText, Loader2, Mic, MonitorUp, CircleHelp, Radio, Shield, Sparkles, Square, Trash2, Upload, Volume2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { LiveDot, Mascot, TopBar } from "@/components/brand";
import { Walkthrough, useWalkthrough, type WalkStep } from "@/components/Walkthrough";
import { speakNaturally, stopSpeaking } from "@/lib/speak";
import { trpc } from "@/lib/trpc";
import { useDualStreamCapture } from "@/hooks/useDualStreamCapture";
import { useAnswersPublisher } from "@/hooks/useAnswersChannel";
import { usePresentChannel } from "@/hooks/usePresentChannel";
import { formatClock } from "@shared/interview/presentation";
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

const TAB_ORDER = ["setup", "brief", "practice", "sql", "present", "live"] as const;

function Workspace({ dialects, liveAssistEnabled }: { dialects: readonly string[]; liveAssistEnabled: boolean }) {
  const [tab, setTab] = useState<string>(() => {
    const requested = new URLSearchParams(window.location.search).get("tab") ?? "";
    return (TAB_ORDER as readonly string[]).includes(requested) ? requested : "setup";
  });
  const tour = useWalkthrough("interview", true);
  const steps: WalkStep[] = [
    { kicker: "Welcome", title: "Five minutes to ready", body: "This walkthrough follows the real flow: add your materials, approve a brief, practice, then go live or present. Use Next — the tabs move with you." },
    { kicker: "Step 1 · Setup", title: "Paste the job and your résumé", body: "Add a job description and your résumé as materials. They stay in your private workspace and are only used to build your brief. Then click Generate brief." },
    { kicker: "Step 2 · Brief", title: "Review and approve the evidence", body: "The brief maps every requirement to evidence from your résumé. Gaps are flagged, never invented. Practice and Live only unlock after you approve it." },
    { kicker: "Step 3 · Practice", title: "Answer, get scored, improve", body: "Pick a question and it is read aloud like a real interviewer. Answer by voice, check the transcript, and get rubric feedback — then the follow-up question is read to you to keep going." },
    { kicker: "Step 4 · SQL Lab", title: "Generate SQL, safely checked", body: "Describe the problem and get a solution with explanation and edge cases. Every query passes a read-only safety gate — nothing is ever executed." },
    { kicker: "Step 5 · Present", title: "Turn any script into a prompter", body: "Paste a talk or slide notes and generate cue cards with time budgets. Open the prompter on a second screen and advance with Space while you speak." },
    ...(liveAssistEnabled ? [{ kicker: "Step 6 · Live", title: "Grounded help while you talk", body: "With your permission, Live transcribes the interviewer and streams a short, evidence-linked suggestion to the answers window. Start with the manual question box to try it solo." } as WalkStep] : []),
  ];
  return (
    <main className="min-h-screen bg-background text-slate-950">
      <TopBar
        right={
          <div className="flex items-center gap-3">
            <LiveDot live={liveAssistEnabled} label={liveAssistEnabled ? "Live assist ready" : "Prep mode"} />
            <Button variant="ghost" size="sm" onClick={tour.start}><CircleHelp className="mr-1.5 h-4 w-4" /> Walkthrough</Button>
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex"><Link href="/interview/present">Prompter</Link></Button>
          </div>
        }
      />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10">
        <header className="mb-6 flex items-start gap-4">
          <Mascot pose="evidence" className="hidden h-20 w-16 shrink-0 md:block" />
          <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">Interview Copilot</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-600">
            Prepare a truthful, evidence-linked brief, practice with feedback, solve SQL safely — then present with a prompter that keeps you on pace.
          </p>
          </div>
        </header>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="brief">Brief</TabsTrigger>
            <TabsTrigger value="practice">Practice</TabsTrigger>
            <TabsTrigger value="sql">SQL Lab</TabsTrigger>
            <TabsTrigger value="present">Present</TabsTrigger>
            {liveAssistEnabled ? <TabsTrigger value="live">Live</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="setup"><SetupTab onBriefReady={() => setTab("brief")} /></TabsContent>
          <TabsContent value="brief"><BriefTab onPractice={() => setTab("practice")} /></TabsContent>
          <TabsContent value="practice"><PracticeTab /></TabsContent>
          <TabsContent value="sql"><SqlTab dialects={dialects} /></TabsContent>
          <TabsContent value="present"><PresentTab /></TabsContent>
          {liveAssistEnabled ? <TabsContent value="live"><LiveTab /></TabsContent> : null}
        </Tabs>
      </div>
      <Walkthrough open={tour.open} steps={steps} onClose={tour.close} onStep={i => { const target = TAB_ORDER[Math.max(0, i - 1)]; if (i > 0 && target) setTab(target); }} />
    </main>
  );
}

// --- Setup -----------------------------------------------------------------

const SAMPLE_JD = `Senior BI Lead — Analytics Platform

We are hiring a Senior BI Lead to own metric definitions and executive dashboards.
Must have: stakeholder alignment across product and finance; analytics delivery with SQL and dbt; clear communication of data decisions to nontechnical executives.
Nice to have: dashboard migration experience and experimentation reporting.
You will define the revenue metric model, lead a small analytics team, and present quarterly results.`;

const SAMPLE_RESUME = `Alex Rivera — BI Lead, 8 years

Led analytics at a SaaS company: built the executive dashboard used by product and finance, resolving a metric-definition disagreement by documenting revenue definitions and decision owners.
Delivered SQL and dbt pipelines for retention reporting; onboarding analytics cut reporting turnaround from two weeks to two days.
Presented quarterly business reviews to nontechnical executives.
Note: no Kubernetes production migration experience.`;

const ACCEPTED_UPLOAD = ".md,.txt,.markdown,text/markdown,text/plain";
const MAX_MATERIAL_CHARS = 500_000;

function guessKind(filename: string): MaterialKind {
  const name = filename.toLowerCase();
  if (/(cv|resume|résumé)/.test(name)) return "resume";
  if (/(jd|job|role|description)/.test(name)) return "job_description";
  return "job_description";
}

function SetupTab({ onBriefReady }: { onBriefReady?: () => void } = {}) {
  const utils = trpc.useUtils();
  const [kind, setKind] = useState<MaterialKind>("job_description");
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [sampleStatus, setSampleStatus] = useState("");
  const materials = trpc.interview.materials.list.useQuery({ workspaceId: WS });
  const create = trpc.interview.materials.create.useMutation({
    onSuccess: () => { setText(""); setFileName(""); setFileError(""); utils.interview.materials.list.invalidate(); },
  });
  const remove = trpc.interview.materials.delete.useMutation({
    onSuccess: () => utils.interview.materials.list.invalidate(),
  });
  const generate = trpc.interview.brief.generate.useMutation({
    onSuccess: () => { utils.interview.brief.get.invalidate(); utils.interview.practice.questions.invalidate(); onBriefReady?.(); },
  });
  const deleteAll = trpc.interview.workspace.deleteAll.useMutation({
    onSuccess: () => { setSampleStatus(""); void utils.interview.invalidate(); },
  });

  const hasKind = (k: MaterialKind) => Boolean(materials.data?.some(m => m.kind === k));
  const hasJD = hasKind("job_description");
  const hasResume = hasKind("resume");
  const ready = hasJD && hasResume;

  const loadFile = async (file: File) => {
    setFileError("");
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".pdf")) {
      setFileError("PDF upload is coming soon — for now, export or save it as .md or plain text (.txt) and upload that.");
      return;
    }
    if (!/\.(md|txt|markdown)$/.test(lower)) {
      setFileError("That file type is not supported yet. Use .md or .txt — PDF is coming soon.");
      return;
    }
    const content = await file.text();
    if (!content.trim()) { setFileError("That file looks empty."); return; }
    if (content.length > MAX_MATERIAL_CHARS) { setFileError(`That file is ${content.length.toLocaleString()} characters — the practical limit is ${MAX_MATERIAL_CHARS.toLocaleString()}. Split it into two materials.`); return; }
    setText(content);
    setFileName(file.name);
    setKind(guessKind(file.name));
  };

  const loadSamples = async () => {
    setSampleStatus("Loading demo materials…");
    try {
      if (!hasJD) await create.mutateAsync({ workspaceId: WS, kind: "job_description", text: SAMPLE_JD });
      if (!hasResume) await create.mutateAsync({ workspaceId: WS, kind: "resume", text: SAMPLE_RESUME });
      setSampleStatus("Demo materials loaded — Generate brief when ready.");
    } catch {
      setSampleStatus("Demo materials could not be loaded. Paste yours instead.");
    }
  };

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Setup progress">
        {[
          { label: "1 · Add job description", done: hasJD },
          { label: "2 · Add résumé", done: hasResume },
          { label: "3 · Generate brief", done: false },
        ].map((step, i) => (
          <li key={step.label} className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium ${step.done ? "border-emerald-600/25 bg-emerald-50 text-emerald-700" : i === (hasJD ? (hasResume ? 2 : 1) : 0) ? "border-slate-950/20 bg-white text-slate-900" : "border-slate-950/[0.07] bg-white text-slate-400"}`}>
              {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}{step.label}
            </span>
            {i < 2 ? <span className="text-slate-300">→</span> : null}
          </li>
        ))}
      </ol>

      <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add material</CardTitle>
          <CardDescription>Paste it, or upload a .md / plain-text file. Stored privately and used only to build your brief.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex rounded-xl bg-slate-950/[0.04] p-1" role="tablist" aria-label="How to add material">
            <button type="button" role="tab" aria-selected={mode === "paste"} onClick={() => setMode("paste")} className={`h-8 flex-1 rounded-[9px] text-sm font-medium transition ${mode === "paste" ? "bg-white shadow-sm" : "text-slate-500"}`}>Paste text</button>
            <button type="button" role="tab" aria-selected={mode === "upload"} onClick={() => setMode("upload")} className={`h-8 flex-1 rounded-[9px] text-sm font-medium transition ${mode === "upload" ? "bg-white shadow-sm" : "text-slate-500"}`}>Upload file</button>
          </div>

          <div className="space-y-1.5">
            <Label>This is a…</Label>
            <Select value={kind} onValueChange={v => setKind(v as MaterialKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATERIAL_KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {mode === "paste" ? (
            <div className="space-y-2">
              <Textarea
                rows={8}
                value={text}
                onChange={e => setText(e.target.value)}
                onPaste={e => {
                  // Handle paste explicitly so a full Ctrl+A dump always lands,
                  // inserted at the cursor rather than depending on defaults.
                  const pasted = e.clipboardData.getData("text");
                  if (!pasted) return;
                  e.preventDefault();
                  const el = e.currentTarget;
                  const start = el.selectionStart ?? text.length;
                  const end = el.selectionEnd ?? text.length;
                  setText(text.slice(0, start) + pasted + text.slice(end));
                }}
                placeholder={kind === "resume" ? "Paste your whole résumé here — Ctrl+A in the original, copy, then dump it all in. No need to tidy it." : "Paste the whole job description here — dump it all in. No need to tidy it."}
                aria-label="Paste material text"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={async () => {
                  try {
                    const clip = await navigator.clipboard.readText();
                    if (clip) { setText(prev => (prev ? `${prev}\n\n${clip}` : clip)); setFileError(""); }
                    else setFileError("Clipboard looks empty — copy the material first, or click the box and press Ctrl+V.");
                  } catch {
                    setFileError("Clipboard access was blocked — click the box above and press Ctrl+V (Cmd+V on Mac) instead.");
                  }
                }}>Paste from clipboard</Button>
                <span className="text-xs text-slate-400">Paste everything as-is — the brief organises it logically for you.</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center transition ${dragOver ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50/60 hover:border-slate-400"}`}
              >
                <Upload className="h-6 w-6 text-slate-400" />
                <span className="mt-2 text-sm font-medium text-slate-700">{fileName || "Drop a file here or click to choose"}</span>
                <span className="mt-0.5 text-xs text-slate-400">.md or .txt, up to {MAX_MATERIAL_CHARS.toLocaleString()} characters</span>
                <input type="file" accept={ACCEPTED_UPLOAD} className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ""; }} aria-label="Upload a markdown or text file" />
              </label>
              <div className="flex items-center justify-between rounded-xl border border-slate-950/[0.06] bg-slate-50/50 px-3 py-2 text-sm text-slate-400" aria-disabled="true">
                <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> PDF document</span>
                <Badge variant="secondary">Coming soon</Badge>
              </div>
              <p className="text-xs text-slate-400">PDF parsing needs an extra step to extract text reliably, so it is on the way. Until then, “Save as” text or markdown from any PDF reader works.</p>
              {text ? <Textarea rows={5} value={text} onChange={e => setText(e.target.value)} aria-label="Uploaded file preview — editable" /> : null}
            </div>
          )}
          {fileError ? <ErrorNote message={fileError} /> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={!text.trim() || create.isPending} onClick={() => create.mutate({ workspaceId: WS, kind, text })}>
              {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Add {labelFor(kind).toLowerCase()}
            </Button>
            <span className="tnum text-xs text-slate-400">{text.length.toLocaleString()} / {MAX_MATERIAL_CHARS.toLocaleString()} chars</span>
          </div>
          {create.error ? <ErrorNote message={create.error.message} /> : null}

          <div className="border-t border-slate-100 pt-3">
            <Button variant="ghost" size="sm" className="text-slate-500" disabled={create.isPending} onClick={() => void loadSamples()}>
              Deleted the demo or just exploring? Load demo materials
            </Button>
            {sampleStatus ? <p className="mt-1 text-xs text-slate-500">{sampleStatus}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your materials</CardTitle>
          <CardDescription>{ready ? "Both pieces are in — you are ready to generate the brief." : "You need a job description and a résumé for the strongest brief. One alone still works."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {materials.data?.length ? (
            <ul className="space-y-2">
              {materials.data.map(m => (
                <li key={m.materialId} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-500" /> {labelFor(m.kind)} · {m.charCount} chars</span>
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate({ workspaceId: WS, materialId: m.materialId })} aria-label={`Delete ${labelFor(m.kind)}`}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center">
              <FileText className="mx-auto h-6 w-6 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-600">Nothing here yet</p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-400">Paste on the left, upload a .md/.txt file, or load the demo materials to see the whole flow in one click.</p>
            </div>
          )}
          <Button
            variant="secondary"
            disabled={!materials.data?.length || generate.isPending}
            onClick={() => generate.mutate({ workspaceId: WS })}
          >
            {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Generate brief
          </Button>
          {!materials.data?.length ? <p className="text-xs text-slate-400">Generate unlocks after your first material.</p> : !ready ? <p className="text-xs text-slate-400">You can generate now; adding the missing piece makes the brief evidence-linked.</p> : null}
          {generate.error ? <ErrorNote message={generate.error.message} /> : null}
          {generate.isSuccess ? <p className="text-sm text-emerald-600">Brief generated — taking you to review it.</p> : null}
          <div className="border-t border-slate-100 pt-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" disabled={deleteAll.isPending}><Trash2 className="mr-1.5 h-4 w-4" /> Delete all my data</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all your data?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently removes your materials, brief, practice history and SQL history from the server. It cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteAll.mutate({ workspaceId: WS })}>Delete everything</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {deleteAll.isSuccess ? <p className="mt-1 text-xs text-slate-500">All your data has been deleted.</p> : null}
            {deleteAll.error ? <ErrorNote message={deleteAll.error.message} /> : null}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

// --- Brief -----------------------------------------------------------------

function BriefTab({ onPractice }: { onPractice?: () => void } = {}) {
  const utils = trpc.useUtils();
  const briefQuery = trpc.interview.brief.get.useQuery({ workspaceId: WS });
  const approve = trpc.interview.brief.approve.useMutation({
    onSuccess: () => { utils.interview.brief.get.invalidate(); utils.interview.practice.questions.invalidate(); },
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
        {approved === "approved" ? <Mascot pose="approve" className="h-12 w-10" alt="Meerkat giving a thumbs up" /> : null}
        {approved !== "approved" ? (
          <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ workspaceId: WS })}>
            {approve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Approve brief
          </Button>
        ) : (
          <Button size="sm" onClick={onPractice}>Start practicing →</Button>
        )}
      </div>
      {approved !== "approved" ? <p className="text-sm text-slate-500">Practice and Live unlock after approval — that keeps every suggestion grounded in evidence you checked.</p> : null}

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
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const submit = trpc.interview.practice.submitAnswer.useMutation();
  const transcribe = trpc.interview.practice.transcribe.useMutation();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const spokenForRef = useRef<string | null>(null);

  // The chatbot voice: device speech synthesis (instant, no provider needed).
  const speak = (text: string) => {
    const chosen = speakNaturally(text, { lang: "en-US", rate: 1, onEnd: () => setSpeaking(false) });
    if (chosen === null && !("speechSynthesis" in window)) { setVoiceStatus("This browser cannot read questions aloud — you can read it above."); return; }
    setSpeaking(true);
  };
  const stopSpeakingLocal = () => { stopSpeaking(); setSpeaking(false); };
  const pickQuestion = (text: string, category: typeof selected extends { category: infer C } | null ? C : never) => {
    stopSpeakingLocal();
    setSelected({ text, category: category as "behavioral" | "technical" | "product" | "sql" });
    setAnswer("");
    submit.reset();
    setVoiceStatus("Listen, then answer by voice — or type if you prefer.");
    speak(text);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setVoiceStatus("Voice recording is not supported in this browser — type your answer instead."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find(m => MediaRecorder.isTypeSupported(m)) ?? "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 16 * 1024 * 1024) { setVoiceStatus("Keep the answer under 16 MB — try a shorter take."); return; }
        setVoiceStatus("Transcribing your answer…");
        try {
          const res = await transcribe.mutateAsync({ workspaceId: WS, audioBase64: await blobToBase64(blob), mimeType: mimeType as "audio/webm" | "audio/mp4" | "audio/ogg" });
          if (res.text.trim()) { setAnswer(res.text.trim()); setVoiceStatus("Transcript ready — edit anything mis-heard, then get feedback."); }
          else setVoiceStatus("I didn't catch that. Try again closer to the mic, or type your answer.");
        } catch {
          setVoiceStatus("Transcription failed. You can type your answer instead.");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setVoiceStatus("Recording… speak naturally, then press Stop.");
    } catch {
      setVoiceStatus("Microphone permission was denied. You can type your answer instead.");
    }
  };
  const stopRecording = () => recorderRef.current?.stop();

  const feedback = submit.data?.feedback;

  // Full loop: when feedback lands, read the headline and first follow-up aloud.
  useEffect(() => {
    if (!feedback || spokenForRef.current === JSON.stringify(feedback.scores)) return;
    spokenForRef.current = JSON.stringify(feedback.scores);
    const parts = [
      feedback.strengths[0] ? `Strength: ${feedback.strengths[0]}` : "",
      feedback.improvements[0] ? `To improve: ${feedback.improvements[0]}` : "",
      feedback.followUpQuestions[0] ? `Follow-up question: ${feedback.followUpQuestions[0]}` : "",
    ].filter(Boolean);
    if (parts.length) speak(`Here's your feedback. ${parts.join(". ")}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback]);

  if (questions.isLoading) return <Loading />;
  if (!questions.data?.approved) return <EmptyNote text="Approve your brief first — practice uses only verified questions." />;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Questions</CardTitle>
          <CardDescription>Pick one and it is read aloud to you, like a real interviewer. Answer by voice and the follow-up keeps the conversation going.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {questions.data.questions.map(q => (
            <button
              key={q.id}
              onClick={() => pickQuestion(q.text, q.category)}
              className={`w-full rounded-md border p-2 text-left text-sm ${selected?.text === q.text ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white"}`}
            >
              <Badge variant="outline" className="mr-2">{q.category}</Badge>{q.text}
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Your answer</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {selected ? <p className="text-sm font-medium text-slate-700">{selected.text}</p> : <p className="text-sm text-slate-500">Select a question — it will be read aloud.</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!selected} onClick={() => selected && (speaking ? stopSpeakingLocal() : speak(selected.text))}>
              <Volume2 className="mr-2 h-4 w-4" /> {speaking ? "Stop reading" : "Hear question"}
            </Button>
            <Button size="sm" disabled={!selected || transcribe.isPending} onClick={() => (recording ? stopRecording() : void startRecording())} className={recording ? "bg-red-600 hover:bg-red-700" : ""}>
              <Mic className="mr-2 h-4 w-4" /> {recording ? "Stop & transcribe" : transcribe.isPending ? "Transcribing…" : "Answer by voice"}
            </Button>
          </div>
          {voiceStatus ? <p className="text-xs text-slate-500" role="status">{voiceStatus}</p> : null}
          <Textarea rows={7} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Your spoken answer appears here — edit anything mis-heard, or type instead…" disabled={!selected} />
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
              {feedback.followUpQuestions.length ? (
                <div>
                  <p className="font-medium text-slate-700">Keep the conversation going</p>
                  <div className="mt-1.5 space-y-1.5">
                    {feedback.followUpQuestions.map((f, i) => (
                      <button key={i} onClick={() => selected && pickQuestion(f, selected.category)} className="block w-full rounded-md border border-slate-200 bg-white p-2 text-left text-sm transition hover:border-emerald-400">
                        {f} <span className="text-xs text-emerald-600">— hear it & answer</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
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

// --- Present (presentation prompter) ----------------------------------------

const SAMPLE_SCRIPT = `Welcome everyone. Today I will show how revenue grew 18 percent this quarter and what drove it.

The headline number is retention. Retention reached 94.2 percent because onboarding now takes two days instead of two weeks.

Next, the roadmap. In Q3 we ship the new dashboard, then the mobile app, and we close with pricing.

To wrap up: growth is real, retention is the engine, and the roadmap is funded. I am happy to take questions.`;

function PresentTab() {
  const [title, setTitle] = useState("My talk");
  const [script, setScript] = useState(SAMPLE_SCRIPT);
  const [targetMinutes, setTargetMinutes] = useState("5");
  const { state, send } = usePresentChannel();
  const generate = trpc.interview.present.generate.useMutation({
    onSuccess: data => send({ type: "load", deck: data.deck, at: Date.now() }),
  });
  const deck = state.deck;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your talk</CardTitle>
          <CardDescription>Paste a script or slide notes. It becomes cue cards: what to say, how to transition, and a time budget per cue. Nothing is stored on the server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Q2 results review" /></div>
          <div className="space-y-1.5"><Label>Script or slide notes</Label><Textarea rows={10} value={script} onChange={e => setScript(e.target.value)} placeholder="Paste your talk, one idea per paragraph…" /></div>
          <div className="space-y-1.5">
            <Label>Target length (minutes, optional)</Label>
            <Input inputMode="numeric" value={targetMinutes} onChange={e => setTargetMinutes(e.target.value)} placeholder="5" className="w-28" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!script.trim() || generate.isPending} onClick={() => generate.mutate({ workspaceId: WS, title: title || undefined, script, targetMinutes: Number(targetMinutes) > 0 ? Number(targetMinutes) : undefined })}>
              {generate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Generate cue cards
            </Button>
            <Button variant="outline" disabled={!deck} onClick={() => window.open("/interview/present", "interview-present", "noopener,width=1200,height=800")}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open prompter
            </Button>
          </div>
          {generate.error ? <ErrorNote message={generate.error.message} /> : null}
          {deck ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Cue cards ready — open the prompter on your second screen, press Start timer there, and advance with Space as you speak.</p> : null}
          {generate.data ? <p className="text-xs text-slate-500">{generate.data.source === "llm" ? "Cue cards written by the model from your script." : "Cue cards split locally from your script (model unavailable — your words, unchanged)."}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cue cards{deck ? <span className="ml-2 text-sm font-normal text-slate-500">{deck.cues.length} cues · {formatClock(deck.totalSeconds)}</span> : null}</CardTitle>
          <CardDescription>Click a cue to jump the prompter to it. Advance from either window — they stay in sync.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {deck ? (
            <>
              {deck.cues.map((cue, i) => (
                <button key={cue.id} onClick={() => send({ type: "goto", index: i })} className={`w-full rounded-md border p-3 text-left text-sm ${i === state.index ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
                  <span className="flex items-center justify-between gap-2"><span className="font-medium">{i + 1}. {cue.title}</span><span className="shrink-0 text-xs opacity-70">{formatClock(cue.seconds)}</span></span>
                  <span className={`mt-1 block ${i === state.index ? "text-slate-200" : "text-slate-600"}`}>{cue.say}</span>
                </button>
              ))}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="secondary" disabled={state.index === 0} onClick={() => send({ type: "back" })}>Back</Button>
                <Button size="sm" disabled={state.index >= deck.cues.length - 1} onClick={() => send({ type: "advance" })}>Next cue</Button>
                <Button size="sm" variant="ghost" onClick={() => send({ type: "clear" })}>Clear</Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Generate cue cards to see them here. The sample script is loaded — one click demos the whole flow.</p>
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

function InterviewVideo({ stream, onShare }: { stream: MediaStream | null; onShare: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  if (!stream) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center rounded-xl bg-slate-950 px-6 text-center">
        <MonitorUp className="h-8 w-8 text-slate-500" />
        <p className="mt-3 max-w-xs text-sm leading-6 text-slate-300">Share the interview tab to see the interviewer here — face, reactions and all — while your answers stay beside it.</p>
        <Button size="sm" className="mt-4 bg-white text-slate-950 hover:bg-slate-200" onClick={onShare}>Share interview tab</Button>
        <p className="mt-2 text-xs text-slate-500">Chrome: pick the meeting tab and tick “Share tab audio”.</p>
      </div>
    );
  }
  // Muted on purpose: the interview audio belongs to your meeting app; this is picture only.
  return <video ref={ref} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black object-contain" aria-label="Shared interview tab video" />;
}

function LiveTab() {
  const [consent, setConsent] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [suggestion, setSuggestion] = useState<LiveSuggestion | null>(null);
  const [streamPreview, setStreamPreview] = useState<StreamingFields | null>(null);
  const [status, setStatus] = useState<string>("");
  // Manual question entry — lets you get a suggestion without an interviewer on
  // the line (solo practice / testing), and as a fallback if capture misfires.
  const [manualQuestion, setManualQuestion] = useState("");

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
  const publisher = useAnswersPublisher();

  const setInterim = (text: string) => {
    interimRef.current = text;
    setInterimState(text);
  };
  const makeSeg = (source: "candidate" | "interviewer", text: string, at: number, language?: string): TranscriptSegment => ({
    id: `${source}-${at}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    text,
    at,
    language,
  });
  const addSegment = (seg: TranscriptSegment) => {
    setSegments(prev => {
      const next = [...prev, seg];
      segmentsRef.current = next;
      return next;
    });
  };
  const updateSegment = (id: string, text: string, language?: string) => {
    setSegments(prev => {
      const next = prev.map(s => (s.id === id ? { ...s, text, language: language ?? s.language } : s));
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
  ): Promise<{ text: string; language: string }> => {
    const audioBase64 = await blobToBase64(blob);
    const res = await transcribe.mutateAsync({ workspaceId: WS, source, audioBase64, mimeType, seq, partial });
    return { text: res.text.trim(), language: res.languageLabel ?? "" };
  };

  // Rolling partial → interim interviewer transcript (drops partials while one
  // is already in flight so requests never pile up).
  const handlePartial = async (p: { source: "candidate" | "interviewer"; blob: Blob; mimeType: "audio/webm" | "audio/mp4" | "audio/ogg"; seq: number }) => {
    if (p.source !== "interviewer" || partialInFlightRef.current) return;
    partialInFlightRef.current = true;
    try {
      const { text } = await transcribeBlob(p.blob, p.source, p.mimeType, p.seq, true);
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
        const { text: finalText, language } = await transcribeBlob(u.blob, "interviewer", u.mimeType, seqRef.current++, false);
        if (finalText) {
          if (segId) updateSegment(segId, finalText, language);
          else addSegment(makeSeg("interviewer", finalText, u.endedAt, language));
        }
      } catch {
        setStatus("A segment could not be transcribed. Still listening.");
      }
      return;
    }
    // Candidate stream: final only (no partials, not used for suggestions).
    try {
      const { text: finalText, language } = await transcribeBlob(u.blob, "candidate", u.mimeType, seqRef.current++, false);
      if (finalText) addSegment(makeSeg("candidate", finalText, u.endedAt, language));
    } catch {
      /* non-fatal */
    }
  };

  const capture = useDualStreamCapture({ onUtterance: handleFinal, onPartial: handlePartial });

  const listening = capture.micState === "listening" || capture.tabState === "listening";

  // Mirror listening state to the answers window.
  useEffect(() => {
    publisher.publish({ type: "status", listening });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  const fireSuggest = async (question: string) => {
    inFlightRef.current = true;
    lastSuggestedRef.current = question;
    setSuggestion(null);
    setStreamPreview({ directAnswer: "", bullets: [] });
    const recent = recentTurns(segmentsRef.current);
    const turnId = crypto.randomUUID();
    publisher.publish({ type: "start", id: turnId, question, at: Date.now() });
    try {
      // Fast path: stream tokens for immediate display; finalize with grounding.
      const streamed = await streamSuggestion(
        question,
        recent,
        fields => {
          setStreamPreview(fields);
          publisher.publish({ type: "stream", id: turnId, directAnswer: fields.directAnswer, bullets: fields.bullets });
        },
        final => {
          setSuggestion(final);
          setStreamPreview(null);
          publisher.publish({ type: "final", id: turnId, question, suggestion: final, at: Date.now() });
        },
      );
      if (!streamed) {
        // Fallback: non-streaming grounded suggestion.
        const res = await suggest.mutateAsync({ workspaceId: WS, question, recent });
        setSuggestion(res.suggestion);
        setStreamPreview(null);
        publisher.publish({ type: "final", id: turnId, question, suggestion: res.suggestion, at: Date.now() });
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
    publisher.reset();
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
      {/* Slim toolbar — controls live here now, the stage below gets the space. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-950/[0.07] bg-white px-3 py-2 shadow-sm">
        <span className={`mr-1 inline-flex items-center gap-2 text-xs font-semibold ${listening ? "text-red-600" : "text-slate-400"}`} role="status">
          <span className={`size-2 rounded-full ${listening ? "animate-pulse bg-red-500" : "bg-slate-300"}`} />{listening ? "Listening" : "Idle"}
        </span>
        <Button variant={capture.micState === "listening" ? "secondary" : "default"} size="sm" onClick={() => capture.startMic()} disabled={capture.micState === "listening"}>
          <Mic className="mr-1.5 h-4 w-4" /> {capture.micState === "listening" ? "Mic on" : "My mic"}
        </Button>
        <Button variant={capture.tabState === "listening" ? "secondary" : "default"} size="sm" onClick={() => capture.startTab()} disabled={capture.tabState === "listening"}>
          <MonitorUp className="mr-1.5 h-4 w-4" /> {capture.tabState === "listening" ? "Tab shared" : "Share interview"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => capture.stop()} disabled={!listening}><Square className="mr-1.5 h-4 w-4" /> Stop</Button>
        <Button variant="ghost" size="sm" onClick={clearSession}><Trash2 className="mr-1.5 h-4 w-4" /> Clear</Button>
        <span className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => window.open("/interview/answers", "interview-answers", "noopener")}><ExternalLink className="mr-1.5 h-4 w-4" /> Answers window</Button>
          <Button variant="outline" size="sm" onClick={() => window.open("/interview/subtitles?popout=1", "interview-subtitles", "popup,width=1100,height=420")}><ExternalLink className="mr-1.5 h-4 w-4" /> Subtitles</Button>
        </span>
        {capture.error ? <p className="flex w-full items-center gap-1.5 pt-1 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" /> {capture.error}</p> : null}
        {status ? <p className="w-full pt-0.5 text-xs text-slate-400">{status}</p> : null}
      </div>

      {/* Stage: interview picture (half) + what to say (half). */}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Interview</p>
            <span className="text-xs text-slate-400">{capture.tabStream ? "Shared tab · picture only" : "Not shared yet"}</span>
          </div>
          <div className="px-3 pb-3"><InterviewVideo stream={capture.tabStream} onShare={() => capture.startTab()} /></div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Radio className="h-5 w-5" /> What to say
              {suggest.isPending || streamPreview ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!suggestion && streamPreview ? (
              <div className="space-y-2">
                <p className="text-base font-medium text-slate-800">{streamPreview.directAnswer || <span className="text-slate-400">…</span>}</p>
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
                <p className="text-base font-medium text-slate-800">{suggestion.directAnswer}</p>
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
              <p className="text-slate-500">Suggestions appear automatically after the interviewer finishes a question — watch their face on the left, glance here, and answer.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-2xl border border-slate-950/[0.07] bg-white px-4 py-3 shadow-sm">
        <Label className="text-xs text-slate-500">Ask manually (solo practice / testing — no interviewer needed)</Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            value={manualQuestion}
            onChange={e => setManualQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && manualQuestion.trim() && !inFlightRef.current) {
                void fireSuggest(manualQuestion.trim());
                setManualQuestion("");
              }
            }}
            placeholder="e.g. Tell me about a time you used SQL to drive a decision"
          />
          <Button size="sm" disabled={!manualQuestion.trim() || inFlightRef.current} onClick={() => { void fireSuggest(manualQuestion.trim()); setManualQuestion(""); }}>
            <Radio className="mr-2 h-4 w-4" /> Get suggestion
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TranscriptColumn title="You (mic)" source="candidate" segments={segments} />
        <TranscriptColumn title="Interviewer (tab)" source="interviewer" segments={segments} interim={interim} />
      </div>
    </div>
  );
}

function TranscriptColumn({ title, source, segments, interim }: { title: string; source: "candidate" | "interviewer"; segments: TranscriptSegment[]; interim?: string }) {
  const rows = segments.filter(s => s.source === source);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">{title}</CardTitle></CardHeader>
      <CardContent className="max-h-36 space-y-1.5 overflow-y-auto text-sm">
        {rows.map(s => (
          <p key={s.id} className="text-slate-700">
            {s.language && s.language !== "English" ? (
              <Badge variant="outline" className="mr-1.5 align-middle text-[10px] font-normal text-slate-500">{s.language}</Badge>
            ) : null}
            {s.text}
          </p>
        ))}
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
