import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Database, FileText, Loader2, Shield, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

const WS = "user";

const MATERIAL_KINDS = [
  { value: "job_description", label: "Job description" },
  { value: "resume", label: "Resume" },
  { value: "project", label: "Project" },
  { value: "notes", label: "Notes" },
] as const;

type MaterialKind = (typeof MATERIAL_KINDS)[number]["value"];

export default function Interview() {
  const { isAuthenticated, loading } = useAuth();
  const config = trpc.interview.config.useQuery();

  if (config.isLoading || loading) {
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
  if (!isAuthenticated) {
    return (
      <Centered>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sign in to continue</CardTitle>
            <CardDescription>Your interview workspace is private to your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => startLogin()}>Sign in</Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  return <Workspace dialects={config.data.dialects} />;
}

function Workspace({ dialects }: { dialects: readonly string[] }) {
  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto max-w-5xl px-5 py-8 lg:px-10">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6 text-indigo-600" /> Interview Copilot</h1>
          <p className="mt-1 text-sm text-slate-600">
            Prepare a truthful, evidence-linked brief, practice with feedback, and solve SQL safely. Nothing is recorded; materials stay in your private workspace.
          </p>
        </header>

        <Tabs defaultValue="setup">
          <TabsList className="mb-4">
            <TabsTrigger value="setup">Setup</TabsTrigger>
            <TabsTrigger value="brief">Brief</TabsTrigger>
            <TabsTrigger value="practice">Practice</TabsTrigger>
            <TabsTrigger value="sql">SQL Lab</TabsTrigger>
          </TabsList>

          <TabsContent value="setup"><SetupTab /></TabsContent>
          <TabsContent value="brief"><BriefTab /></TabsContent>
          <TabsContent value="practice"><PracticeTab /></TabsContent>
          <TabsContent value="sql"><SqlTab dialects={dialects} /></TabsContent>
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
