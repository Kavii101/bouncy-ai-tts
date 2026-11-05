import { useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Shield } from "lucide-react";
import { TopBar } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

type Status = { provider: string; keySource: "env" | "session" | "none"; model: string; claimCheckModel: string; transcriptionModel: string };

const KEY_SOURCE: Record<Status["keySource"], string> = {
  env: "Server settings (.env)",
  session: "Entered here (until the next restart)",
  none: "No key set",
};

export default function Admin() {
  const available = trpc.admin.available.useQuery();
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [current, setCurrent] = useState<Status | null>(null);
  const [message, setMessage] = useState("");

  const saved = (next: Status, note: string) => {
    setCurrent(next);
    setApiKey("");
    setMessage(note);
  };
  const status = trpc.admin.status.useMutation({ onSuccess: next => saved(next, "") });
  const setKey = trpc.admin.setApiKey.useMutation({ onSuccess: next => saved(next, "Key tested and in use. It will reset when the server restarts.") });
  const reset = trpc.admin.resetApiKey.useMutation({ onSuccess: next => saved(next, "Back to the key in the server settings.") });
  const error = status.error ?? setKey.error ?? reset.error;

  return (
    <main className="min-h-screen bg-background text-slate-950">
      <TopBar />
      <div className="mx-auto max-w-xl space-y-4 px-4 py-8">
        <h1 className="text-2xl font-semibold">Admin</h1>

        {available.isLoading ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p> : null}

        {available.data && !available.data.enabled ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Shield className="h-5 w-5" /> The admin panel is off</CardTitle>
              <CardDescription>Set ADMIN_TOKEN in the server settings to turn it on.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {available.data?.enabled && !current ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Shield className="h-5 w-5" /> Sign in</CardTitle>
              <CardDescription>Enter the admin token from the server settings.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={e => { e.preventDefault(); status.mutate({ token }); }}>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-token">Admin token</Label>
                  <Input id="admin-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} />
                </div>
                <Button type="submit" disabled={!token || status.isPending}>Continue</Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {current ? (
          <>
            <Card>
              <CardHeader><CardTitle className="text-lg">Provider</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                  <dt className="text-slate-500">Provider</dt><dd>{current.provider}</dd>
                  <dt className="text-slate-500">Key in use</dt><dd>{KEY_SOURCE[current.keySource]}</dd>
                  <dt className="text-slate-500">Answers</dt><dd>{current.model}</dd>
                  <dt className="text-slate-500">Answer check</dt><dd>{current.claimCheckModel}</dd>
                  <dt className="text-slate-500">Speech to text</dt><dd>{current.transcriptionModel}</dd>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><KeyRound className="h-5 w-5" /> Use your own API key</CardTitle>
                <CardDescription>We test it with {current.provider} first. It is kept in memory only, never shown again, and resets when the server restarts. To keep a key permanently, put it in the server settings.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={e => { e.preventDefault(); setKey.mutate({ token, apiKey }); }}>
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-api-key">API key</Label>
                    <Input id="admin-api-key" type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={apiKey.trim().length < 20 || setKey.isPending}>{setKey.isPending ? "Testing…" : "Test and use key"}</Button>
                    {current.keySource === "session" ? <Button type="button" variant="outline" onClick={() => reset.mutate({ token })}>Use server key</Button> : null}
                  </div>
                </form>
              </CardContent>
            </Card>
          </>
        ) : null}

        {message ? <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {message}</p> : null}
        {error ? <p className="flex items-center gap-1.5 text-sm text-red-600"><AlertCircle className="h-4 w-4" /> {error.message}</p> : null}
      </div>
    </main>
  );
}
