import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveDot, Wordmark } from "@/components/brand";

// Visual review board: what we have vs what needs to change for the
// Bounty Online co-pilot launch. Updated as each stage lands.
const POSES = [
  { id: "P09", src: "/mascot/M-P09.jpg", pose: "Arms raised — celebrating", use: "Welcome, success, film close" },
  { id: "P11", src: "/mascot/M-P11.jpg", pose: "Gold magnifying glass", use: "Evidence and Brief sections" },
  { id: "P19", src: "/mascot/M-P19.jpg", pose: "Thumbs up", use: "Approval and feedback" },
  { id: "S2", src: "/mascot/M-S2.jpg", pose: "Presenting to cards", use: "Landing hero, features" },
];

const HAVE = [
  "Interview Copilot: Setup → Brief → Practice → SQL, all working",
  "Live assist with grounded, evidence-linked suggestions",
  "Present teleprompter with cue cards, timer, second screen",
  "Live Korean subtitles window for Teams / Meet",
  "Listen (TTS) panel with mic input",
  "Setup accepts paste or .md/.txt upload (PDF shown as coming soon) + demo restore",
  "Walkthroughs on every surface for first-time users",
  "Live Scroll teleprompter: follows your voice, holds on pause, bridges off-course",
  "124 automated tests passing, production build green",
  "Mascot originals inventoried — see brand/asset-manifest.md",
];

const CHANGE = [
  { item: "Rename to BountyAI · Bounty Online co-pilot everywhere", status: "Done" },
  { item: "Adopt mascot navy + gold palette in the app (replaces emerald)", status: "Next" },
  { item: "Place meerkat poses: hero, Brief, approval, empty states", status: "Next" },
  { item: "Turn Home into the landing page: demo video slot, how-it-works, FAQ", status: "Planned" },
  { item: "Add end-of-session debrief: summary, strengths, improvement plan", status: "Planned" },
  { item: "Verify exact runtime models — currently OpenAI, no Meta runtime yet", status: "Blocked on keys" },
  { item: "Record the 180s demo film + captions from the shoot script", status: "Planned" },
  { item: "Deploy over HTTPS so live capture works outside localhost", status: "Planned" },
];

const SWATCHES = [
  { name: "Mascot navy", hex: "#13203A", note: "Collar, labels" },
  { name: "Mascot gold", hex: "#F9B600", note: "Tag, accents" },
  { name: "Asset sky", hex: "#DCEBF7", note: "Image backgrounds" },
  { name: "Fur tan", hex: "#C99A63", note: "Character only" },
  { name: "App ink (current)", hex: "#14201B", note: "Buttons, text" },
  { name: "App emerald (current)", hex: "#10B981", note: "To be replaced by navy/gold" },
];

export default function BrandReview() {
  return (
    <main className="min-h-screen bg-background text-slate-950">
      <header className="border-b border-slate-950/[0.07]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-3">
            <LiveDot live label="Review board" />
            <Button asChild size="sm"><Link href="/interview">Open the app</Link></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        <section className="grid items-center gap-8 lg:grid-cols-2">
          <div>
            <Badge className="rounded-full" variant="secondary">Bounty Online co-pilot</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Bring your experience into the moment.</h1>
            <p className="mt-4 max-w-md text-lg leading-8 text-slate-600">Prepare. Speak. Reflect. Grow. This board shows what we have, what changes, and the mascot that carries the brand.</p>
          </div>
          <img src="/mascot/M-S2.jpg" alt="Meerkat mascot presenting feature cards" className="w-full rounded-2xl border border-slate-950/[0.07] object-cover shadow-sm" />
        </section>

        <section>
          <h2 className="text-xl font-semibold tracking-tight">The mascot — approved poses</h2>
          <p className="mt-1 text-sm text-slate-600">Originals untouched in Downloads. These are lightweight web copies. Labels are baked into the corners — we crop, never redraw.</p>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {POSES.map(p => (
              <Card key={p.id} className="overflow-hidden p-0">
                <img src={p.src} alt={`Meerkat pose ${p.id}: ${p.pose}`} className="aspect-square w-full object-cover object-top" />
                <CardContent className="space-y-1 px-4 py-3">
                  <p className="text-sm font-semibold">{p.id} · {p.pose}</p>
                  <p className="text-xs text-slate-500">{p.use}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold tracking-tight">Colour — where it comes from</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {SWATCHES.map(s => (
              <div key={s.name} className="overflow-hidden rounded-xl border border-slate-950/[0.07] bg-white">
                <div className="h-16" style={{ background: s.hex }} />
                <div className="px-3 py-2">
                  <p className="text-xs font-semibold">{s.name}</p>
                  <p className="tnum text-xs text-slate-500">{s.hex}</p>
                  <p className="text-[11px] text-slate-400">{s.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-lg">What we have</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-sm">
                {HAVE.map(h => <li key={h} className="flex gap-2.5"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500" />{h}</li>)}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg">What needs to change</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-sm">
                {CHANGE.map(c => (
                  <li key={c.item} className="flex items-start justify-between gap-3">
                    <span className="flex gap-2.5"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-500" />{c.item}</span>
                    <Badge variant="outline" className="shrink-0 text-[11px]">{c.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <p className="text-xs text-slate-400">Founder direction on file. Runtime credit today: built with help from Meta's Muse Code. No powered-by model claims until verified from configuration.</p>
      </div>
    </main>
  );
}
