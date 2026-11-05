import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AlertCircle, ArrowRight, Check, Download, Headphones, Loader2, Mic, MessageSquareText, Maximize2, Pause, Play, RotateCcw, Square, Volume2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label"; import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mascot, Wordmark } from "@/components/brand";
import { Walkthrough, useWalkthrough } from "@/components/Walkthrough";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bestVoiceName, speakNaturally, stopSpeaking } from "@/lib/speak";
import { trpc } from "@/lib/trpc";

const SAMPLE = "Revenue grew 18% month over month to $128,400, while customer retention reached 94.2% in Q2 2026.";

export default function Home() {
  const tour = useWalkthrough("home");
  const [text, setText] = useState(SAMPLE);
  const [languageCode, setLanguageCode] = useState("en-US");
  const [voiceId, setVoiceId] = useState("Aoede");
  const [speed, setSpeed] = useState(1);   const [playbackRate, setPlaybackRate] = useState(1);   const [sourceType, setSourceType] = useState<"insight" | "report" | "user_text">("user_text"); const [sourceId, setSourceId] = useState("");
  const [cloudAudioUrl, setCloudAudioUrl] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deviceVoice, setDeviceVoice] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Ready to turn an insight into audio.");
  const [fallbackSpeaking, setFallbackSpeaking] = useState(false); const [recording, setRecording] = useState(false); const [transcribing, setTranscribing] = useState(false); const recorderRef = useRef<MediaRecorder | null>(null); const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const config = trpc.tts.config.useQuery();
  const transcribe = trpc.interview.practice.transcribe.useMutation({ onSuccess: result => { setText(current => current ? `${current} ${result.text}` : result.text); setStatusMessage("Transcript added. Review it before generating audio."); setTranscribing(false); }, onError: error => { setStatusMessage(error.message); setTranscribing(false); } });
  const replaceCloudAudio = (url: string | null) => setCloudAudioUrl(previous => { if (previous) URL.revokeObjectURL(previous); return url; });
  const create = trpc.tts.speak.useMutation({ onSuccess: audio => { const bytes = Uint8Array.from(atob(audio.audioBase64), c => c.charCodeAt(0)); replaceCloudAudio(URL.createObjectURL(new Blob([bytes], { type: audio.mimeType }))); setStatusMessage("Audio is ready to play."); }, onError: error => setStatusMessage(error.message) });
  const voices = useMemo(() => config.data?.voices ?? [], [config.data]);
  const maxChars = config.data?.maxChars ?? 5000;

  const cloudAvailable = Boolean(config.data?.cloudAvailable);
  useEffect(() => { if (cloudAudioUrl && audioRef.current) { audioRef.current.src = cloudAudioUrl; audioRef.current.playbackRate = playbackRate; } }, [cloudAudioUrl, playbackRate]);
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, []);
  useEffect(() => {
    const update = () => setDeviceVoice(bestVoiceName(languageCode));
    update();
    if ("speechSynthesis" in window) { window.speechSynthesis.addEventListener("voiceschanged", update); return () => window.speechSynthesis.removeEventListener("voiceschanged", update); }
  }, [languageCode]);

  const startRecording = async () => { if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setStatusMessage("Microphone recording is not supported in this browser."); return; } try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mimeType = ["audio/webm", "audio/mp4", "audio/ogg"].find(type => MediaRecorder.isTypeSupported(type)) ?? "audio/webm"; const recorder = new MediaRecorder(stream, { mimeType }); chunksRef.current = []; recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); }; recorder.onstop = async () => { stream.getTracks().forEach(track => track.stop()); const blob = new Blob(chunksRef.current, { type: mimeType }); if (blob.size > 16 * 1024 * 1024) { setStatusMessage("Keep recordings under 16 MB."); setRecording(false); return; } setTranscribing(true); setStatusMessage("Transcribing your recording…"); const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ""; bytes.forEach(byte => { binary += String.fromCharCode(byte); }); transcribe.mutate({ workspaceId: "user", audioBase64: btoa(binary), mimeType: mimeType as "audio/webm" | "audio/mp4" | "audio/ogg" }); setRecording(false); }; recorder.start(); recorderRef.current = recorder; setRecording(true); setStatusMessage("Recording… select Stop when you are finished."); } catch { setStatusMessage("Microphone permission was denied or unavailable. You can type the text instead."); } };   const stopRecording = () => recorderRef.current?.stop();    const generate = () => {
    setFallbackSpeaking(false); setStatusMessage("Generating audio…");
    create.mutate({ text, languageCode, voiceId, speed });
  };
  const speakOnDevice = () => {
    if (!("speechSynthesis" in window)) { setStatusMessage("Device read-aloud is not available in this browser."); return; }
    if (fallbackSpeaking) { stopSpeaking(); setFallbackSpeaking(false); setStatusMessage("Device read-aloud stopped."); return; }
    const chosen = speakNaturally(text, { lang: languageCode, rate: speed, onEnd: () => setFallbackSpeaking(false) });
    setFallbackSpeaking(true);
    setStatusMessage(chosen ? `Reading aloud in a natural voice (${chosen}).` : "Reading aloud on this device.");
  };
  const clear = () => { setText(""); replaceCloudAudio(null); setStatusMessage("Ready for new text."); };

  return <main className="min-h-screen bg-background text-slate-950">
    <nav className="sticky top-0 z-20 border-b border-slate-950/[0.07] bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5 lg:px-12">
        <Wordmark />
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="hidden text-slate-600 sm:inline-flex" onClick={tour.start}>How it works</Button>
          <Button asChild variant="ghost" size="sm" className="hidden text-slate-600 sm:inline-flex"><a href="#listen">Listen</a></Button>
          <Button asChild size="sm">
            <Link href="/interview"><MessageSquareText size={15} className="mr-1.5" /> Interview Copilot</Link>
          </Button>
        </div>
      </div>
    </nav>
    <div id="listen" className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 py-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start lg:px-12">
      <section className="space-y-7 lg:sticky lg:top-24">
        <div><Badge className="mb-5 rounded-full border border-emerald-600/20 bg-emerald-50 px-3 py-1 font-medium text-emerald-700 hover:bg-emerald-50"><span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" />Bounty Online co-pilot</Badge><h1 className="max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.04em] text-slate-950 sm:text-6xl">Bring your experience into the moment.</h1><p className="mt-6 max-w-lg text-lg leading-8 text-slate-600">One co-pilot for the moments that decide your work: hear your reports, prepare for the interview, and deliver the presentation — each built around your own material, not generic answers.</p></div>
        <div className="grid max-w-lg grid-cols-3 gap-3 text-sm"><div className="rounded-2xl border border-slate-200 bg-white p-4"><Headphones className="mb-5 text-emerald-600" size={19} /><span className="font-medium">Listen in context</span></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><Volume2 className="mb-5 text-emerald-600" size={19} /><span className="font-medium">Natural delivery</span></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><Check className="mb-5 text-emerald-600" size={19} /><span className="font-medium">Manual by design</span></div></div>
        <div className="flex gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
          <Mascot pose="present" className="hidden h-28 w-24 shrink-0 sm:block" />
          <div>
          <div className="flex items-center gap-2 text-emerald-700"><MessageSquareText size={18} /><span className="text-sm font-semibold uppercase tracking-wide">Interview Copilot</span></div>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Real-time, evidence-grounded interview prep and live assist — transcribes the room, understands the question, and suggests what to say.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild className="bg-slate-950 hover:bg-slate-800">
              <Link href="/interview">Open Interview Copilot <ArrowRight size={16} className="ml-1.5" /></Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/interview?tab=present">Present a talk</Link>
            </Button>
          </div>
          </div>
        </div>
      </section>
      <Card className="overflow-hidden rounded-[2rem] border-0 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]"><CardHeader className="border-b border-slate-100 bg-slate-950 px-6 py-7 text-white sm:px-9"><div className="flex items-start justify-between gap-4"><div><CardTitle className="text-2xl tracking-tight">Listen</CardTitle><CardDescription className="mt-2 text-slate-300">Paste an insight, report section, or write something new.</CardDescription></div><Wand2 className="text-emerald-300" size={25} /></div></CardHeader><CardContent className="space-y-7 px-6 py-7 sm:px-9">
        {config.data && !cloudAvailable && <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900"><AlertCircle size={18} className="mt-0.5 shrink-0" /><div><strong>Cloud voices are not set up on this server.</strong><p className="mt-1 text-emerald-700">You can still use the device read-aloud below.</p></div></div>}
        <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><Label htmlFor="tts-text">Text to speak</Label><span className={`text-xs ${text.length > maxChars ? "text-red-600" : "text-slate-400"}`}>{text.length.toLocaleString()} / {maxChars.toLocaleString()}</span></div><Button type="button" variant="outline" size="sm" onClick={recording ? stopRecording : startRecording} disabled={transcribing}>{recording ? <><Square size={14} /> Stop recording</> : <><Mic size={14} /> Speak to enter text</>}</Button></div><div className="relative"><Textarea id="tts-text" value={text} onChange={event => setText(event.target.value)} className="h-44 max-h-44 [field-sizing:fixed] resize-none overflow-y-auto rounded-2xl border-slate-200 bg-slate-50/70 p-4 leading-7 focus-visible:ring-emerald-500" placeholder="Write or paste an insight — long reports stay in this box and scroll…" aria-describedby="tts-status" /><Button type="button" size="sm" variant="secondary" className="absolute right-3 bottom-3 shadow-sm" onClick={() => setEditorOpen(true)}><Maximize2 size={14} className="mr-1.5" /> Expand</Button></div></div>
        <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label>Source</Label><Select value={sourceType} onValueChange={value => setSourceType(value as typeof sourceType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user_text">My text</SelectItem><SelectItem value="insight">Bounty insight</SelectItem><SelectItem value="report">Report section</SelectItem></SelectContent></Select></div>{sourceType !== "user_text" && <div className="space-y-2"><Label htmlFor="source-id">Source ID</Label><Input id="source-id" value={sourceId} onChange={event => setSourceId(event.target.value)} placeholder="e.g. insight-123" /></div>}<div className="space-y-2"><Label>Language</Label><Select value={languageCode} onValueChange={setLanguageCode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(config.data?.languages ?? ["en-US"]).map(language => <SelectItem key={language} value={language}>{language}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Voice</Label><Select value={voiceId} onValueChange={setVoiceId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{voices.map(voice => <SelectItem key={voice.id} value={voice.id}>{voice.label}</SelectItem>)}</SelectContent></Select></div></div>
        <div className="space-y-3"><div className="flex items-center justify-between"><Label htmlFor="speed">Speech speed</Label><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{speed.toFixed(2)}×</span></div><Slider id="speed" min={0.75} max={1.5} step={0.25} value={[speed]} onValueChange={value => setSpeed(value[0] ?? 1)} aria-label="Speech speed" /></div>
        {deviceVoice ? <p className="text-xs text-slate-400">Device voice: {deviceVoice} — the most natural voice this device offers.</p> : null}
        <div id="tts-status" role="status" aria-live="polite" className="min-h-5 text-sm text-slate-600">{create.isPending && <Loader2 className="mr-2 inline animate-spin" size={15} />}{statusMessage}</div>
        {cloudAudioUrl && <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-emerald-950">Cloud audio ready</span><Badge className="bg-white text-emerald-700 hover:bg-white">Not stored</Badge></div><audio ref={audioRef} controls preload="metadata" className="w-full" aria-label="Generated BountyAI voiceover" /><div className="flex items-center gap-3"><Label htmlFor="playback-rate" className="text-xs text-emerald-900">Playback speed</Label><Select value={String(playbackRate)} onValueChange={value => { const rate = Number(value); setPlaybackRate(rate); if (audioRef.current) audioRef.current.playbackRate = rate; }}><SelectTrigger id="playback-rate" className="h-8 w-24 bg-white text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0.75">0.75×</SelectItem><SelectItem value="1">1×</SelectItem><SelectItem value="1.25">1.25×</SelectItem><SelectItem value="1.5">1.5×</SelectItem></SelectContent></Select></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={generate} disabled={create.isPending}><RotateCcw size={15} /> Regenerate</Button><Button variant="outline" size="sm" asChild><a href={cloudAudioUrl} download="bouncy-ai-voiceover.mp3"><Download size={15} /> Download MP3</a></Button></div></div>}
        <div className="flex flex-col gap-3 sm:flex-row"><Button className="h-12 flex-1 rounded-xl bg-emerald-600 text-base shadow-lg shadow-slate-950/15 hover:bg-emerald-700" onClick={generate} disabled={!cloudAvailable || create.isPending || !text.trim() || text.length > maxChars}>{create.isPending ? <Loader2 className="animate-spin" /> : <Play size={17} />} Generate cloud audio <ArrowRight size={16} /></Button><Button variant="outline" className="h-12 rounded-xl border-slate-200" onClick={speakOnDevice} disabled={!text.trim()}>{fallbackSpeaking ? <Pause size={17} /> : <Volume2 size={17} />} {fallbackSpeaking ? "Stop device read-aloud" : "Read aloud on this device"}</Button></div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-4"><p className="text-xs leading-5 text-slate-500">Audio generation is always manual. Device read-aloud uses your browser’s available voice.</p><Button variant="ghost" size="sm" onClick={clear} className="text-slate-500">Clear</Button></div>
      </CardContent></Card>
    </div>
    <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Your text, full size</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-400">{text.length.toLocaleString()} / {maxChars.toLocaleString()} characters · edits here update the Listen panel</p>
        <Textarea value={text} onChange={event => setText(event.target.value)} className="h-[55vh] [field-sizing:fixed] resize-none overflow-y-auto rounded-xl p-4 leading-7" aria-label="Full-size text editor" autoFocus />
        <div className="flex justify-end"><Button onClick={() => setEditorOpen(false)}>Done</Button></div>
      </DialogContent>
    </Dialog>

    <section id="products" className="mx-auto max-w-7xl px-5 pb-20 lg:px-12" aria-label="What Bounty Online co-pilot does">
      <div className="mb-8 max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-[-0.02em]">Three moments. One co-pilot.</h2>
        <p className="mt-2 text-slate-600">Different people come for different moments. Pick yours — each one starts from your own material.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <article className="flex flex-col rounded-2xl border border-slate-950/[0.07] bg-white p-6 shadow-sm">
          <Mascot pose="welcome" className="mb-5 h-36 w-full" />
          <p className="text-xs font-semibold text-emerald-600">LISTEN · FOR PEOPLE WHO READ REPORTS</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Turn reports into voiceovers people finish.</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">Dashboards and insight reports nobody reads become clear audio you can absorb anywhere — natural voices, your words, generated only when you ask.</p>
          <Button asChild className="mt-5"><a href="#listen">Try Listen <ArrowRight size={15} className="ml-1.5" /></a></Button>
        </article>
        <article className="flex flex-col rounded-2xl border border-slate-950/[0.07] bg-white p-6 shadow-sm">
          <Mascot pose="evidence" className="mb-5 h-36 w-full" />
          <p className="text-xs font-semibold text-emerald-600">INTERVIEW · FOR PEOPLE WITH A DATE IN THE DIARY</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Walk in ready to pass — with your own evidence.</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">Your CV and the job description become an evidence-linked brief, spoken practice with follow-ups, and grounded support while you talk. Nothing invented, gaps shown honestly.</p>
          <Button asChild className="mt-5"><Link href="/interview">Prepare for your interview <ArrowRight size={15} className="ml-1.5" /></Link></Button>
        </article>
        <article className="flex flex-col rounded-2xl border border-slate-950/[0.07] bg-white p-6 shadow-sm">
          <Mascot pose="present" className="mb-5 h-36 w-full" />
          <p className="text-xs font-semibold text-emerald-600">PRESENT · FOR PEOPLE WHO TALK TO SLIDES</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight">Deliver the talk, don’t read it.</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">Your script becomes a teleprompter that scrolls with your voice, holds when you pause, and bridges you back when you wander — so you face the audience, not your notes.</p>
          <Button asChild className="mt-5"><Link href="/interview?tab=present">Present a talk <ArrowRight size={15} className="ml-1.5" /></Link></Button>
        </article>
      </div>
      <p className="mt-8 text-center text-xs text-slate-400">Built with help from Meta’s Muse Code. Prepare · Speak · Reflect · Grow.</p>
    </section>
    <Walkthrough open={tour.open} onClose={tour.close} steps={[
      { kicker: "1 · Listen", title: "Hear any insight in seconds", body: "Paste a report or write your own words, pick a voice, and generate a voiceover. Or use Read aloud on this device for an instant preview." },
      { kicker: "2 · Interview", title: "Prepare with evidence, not guesses", body: "Open Interview Copilot, paste the job description and your resume, and approve the brief it builds. Practice answers are scored against your real experience." },
      { kicker: "3 · Present", title: "Speak from a prompter, not memory", body: "In the Present tab, paste your talk and get cue cards with time budgets. Open the prompter full-screen and advance with Space while you talk." },
    ]} />
  </main>;
}
