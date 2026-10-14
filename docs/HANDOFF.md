# Handoff — continue the Interview Copilot with an AI assistant on real infra

Paste this whole file as the **first message** to a coding assistant running on a
machine that can execute commands, edit files, run servers, and reach a VPS
(e.g. a local Mac for dev + a VPS for hosting).

---

## Mission

Continue an existing feature branch. Get it running against real infrastructure
(local **Mac** for dev + a **VPS** for hosting), test it end-to-end, fix
integration bugs, then add a cross-device "answers" channel so a **phone** can be
the teleprompter. Work in small, verified steps; keep build, typecheck, and tests
green at every commit.

## Repository

- GitHub: `Kavii101/bouncy-ai-tts`
- Branch: `feat/interview-copilot` (open PR #1).
- Start: `git clone`, `git checkout feat/interview-copilot`, `pnpm install`.
- Stack: Node + Express + **tRPC** + **Drizzle ORM (MySQL / mysql2)** +
  **Vite/React** (wouter router) + **pnpm**. It's a Manus WebDev template app; a
  provider called "Forge" (OpenAI-compatible) backs the LLM, Whisper
  transcription, and object storage.
- Scripts: `pnpm dev` (tsx watch, Vite middleware, auto-picks a port from 3000),
  `pnpm build` (vite build + esbuild server → `dist/`), `pnpm start`
  (`node dist/index.js`), `pnpm check` (tsc), `pnpm test` (vitest),
  `pnpm db:push` (drizzle-kit generate && migrate).

## What the feature is (already built on this branch)

An Interview Copilot with two surfaces:

- **Control page** `/interview` — tabs: Setup (paste JD/résumé), Brief
  (LLM-extracted, evidence-linked, must be Approved), Practice (typed answer →
  rubric feedback), SQL Lab (generation + a read-only safety gate), and **Live**
  (dual-stream capture + suggestions).
- **Answers page** `/interview/answers` — a receive-only teleprompter showing the
  current question, the direct answer + bullets to say, confidence, "verify
  before stating as fact" warnings, and a history. Driven by the Live tab over a
  **same-browser `localStorage` channel**.

Live assist specifics already implemented:

- **Dual-stream capture** (`client/src/hooks/useDualStreamCapture.ts`): your mic
  (`getUserMedia` = "candidate") and the interview tab/system audio
  (`getDisplayMedia` = "interviewer") captured as two separate, never-mixed,
  VAD-gated streams. Emits rolling **partial** chunks + a **final** chunk per
  utterance.
- **Pseudo-streaming STT**: interviewer partials transcribe into a live interim
  transcript; at the pause the interim is optimistically committed so the planner
  fires without waiting, then corrected by the final transcription.
- **Turn planner** (`shared/interview/liveSession.ts`, pure + unit-tested): waits
  for the pause, assembles the question, classifies **new / repeat-or-
  clarification / echo**.
- **Token-streamed suggestions**: `POST /api/interview/live/stream` (SSE) streams
  the answer; `shared/interview/streamingJson.ts` renders partial JSON live;
  grounding is finalized from the complete JSON. Falls back to the batch
  `interview.live.suggest` tRPC call.
- Single-user, **no login** (procedures are `publicProcedure`, shared `solo`
  workspace). Behind two flags: `INTERVIEW_COPILOT_ENABLED` and
  `INTERVIEW_LIVE_ASSIST_ENABLED` (both default off).

Status: `pnpm check` ✅, `pnpm build` ✅, **68 interview unit tests** ✅. It has
**never been run against a live server** — that's the first job. (Note:
`server/voice.transcribe.test.ts` fails without a live `DATABASE_URL`; that's
pre-existing and unrelated — don't chase it.)

Key files: `server/routers/interview.ts`, `server/interview/*` (extraction,
answer-engine, sql-engine, grounding, redaction, store, liveStream, schemas),
`server/_core/llm.ts` (`invokeLLM`, `invokeLLMStream`),
`server/_core/voiceTranscription.ts`, `server/storage.ts`, `drizzle/schema.ts` +
`drizzle/0002_*.sql`, `client/src/pages/Interview.tsx`,
`client/src/pages/InterviewAnswers.tsx`, `client/src/hooks/useAnswersChannel.ts`,
`shared/interview/*`. Design notes in `docs/interview-copilot.md`.

## ⚠️ CRITICAL first decision: which provider backs LLM + STT + storage?

The code calls Manus **Forge** by default (`BUILT_IN_FORGE_API_URL`,
`BUILT_IN_FORGE_API_KEY`):

- LLM chat/stream → `{FORGE}/v1/chat/completions` (OpenAI-compatible; streaming +
  json_schema).
- Transcription → `{FORGE}/v1/audio/transcriptions` (`whisper-1`, multipart).
- Object storage → `{FORGE}/v1/storage/presign/{put,get}` — **Manus-specific,
  NOT OpenAI**.

The interview transcription path is: `interview.live.transcribeSegment` →
`storagePut()` (Forge presign) → `storageGetSignedUrl()` → `transcribeAudio(url)`.
**So transcription depends on Forge object storage.**

Pick ONE and tell the user which:

- **Option A — Forge creds available** (from the user's Manus app): set
  `BUILT_IN_FORGE_API_URL` + `BUILT_IN_FORGE_API_KEY` and everything works
  unchanged. Easiest.
- **Option B — self-host with OpenAI (or compatible) on the VPS**: point
  `BUILT_IN_FORGE_API_URL=https://api.openai.com` and use an OpenAI key. Chat +
  streaming work. **But remove the storage hop for transcription**: add a
  `transcribeBytes(buffer, mimeType, …)` path in
  `server/_core/voiceTranscription.ts` that multipart-POSTs the audio bytes
  **directly** to `/v1/audio/transcriptions` (no presign/URL), and change
  `interview.live.transcribeSegment` (and `voice.transcribe` if you want the
  Listen panel) to call it instead of `storagePut` + signed URL. The TTS "Listen"
  panel's audio storage stays broken under Option B — fine; the interview feature
  doesn't need it. (OpenAI streaming transcription would need `gpt-4o-transcribe`,
  not `whisper-1` — optional, later.)

Ask the user which option before writing provider code.

## Step 1 — Run locally on the Mac (localhost = secure context, capture works)

1. Provision MySQL. Simplest:
   `docker run -d --name bai-mysql -e MYSQL_ROOT_PASSWORD=pass -e MYSQL_DATABASE=bai -p 3306:3306 mysql:8`.
2. Create `.env` with at least:
   ```
   DATABASE_URL=mysql://root:pass@127.0.0.1:3306/bai
   BUILT_IN_FORGE_API_URL=...        # Forge base URL, or https://api.openai.com (Option B)
   BUILT_IN_FORGE_API_KEY=...
   INTERVIEW_COPILOT_ENABLED=true
   INTERVIEW_LIVE_ASSIST_ENABLED=true
   JWT_SECRET=dev-secret
   # OAuth vars are NOT needed for the interview feature (it's public). Leave unset.
   ```
3. `pnpm db:push` → confirm the `interview_*` tables (migration `0002`) plus the
   `tts_*`/`users` tables exist.
4. `pnpm dev`, open the printed `http://localhost:<port>/interview`.
5. Fix anything that breaks on real calls (DB types, Forge request/response
   shape, SSE behavior).

## Step 2 — End-to-end acceptance test (manually in Chrome; script what you can)

- Setup: paste a real JD + résumé → each "Add material" persists (check DB rows)
  → "Generate brief" returns a structured brief.
- Brief: shows requirements/evidence/gaps/questions → "Approve" flips it to
  approved.
- Practice: pick a question, type an answer → rubric feedback returns; unsupported
  claims are flagged; the stored row has an **answer hash, not raw text**.
- SQL Lab: a normal prompt returns SQL marked **read-only**; a prompt that tempts
  `DROP`/`DELETE` → the generated query is marked **rejected** by the safety gate.
  Also unit-verify `checkReadOnlySql`.
- Live: consent → Start mic → Share interview audio (Chrome, "Share tab audio"
  checked) → speak as the interviewer → interim transcript appears → on pause a
  suggestion **streams** in. Repeat a question → it refines, doesn't duplicate.
  Open the **answers window** → it mirrors the current answer + history; reload it
  → state persists.
- Regression: `pnpm check`, `pnpm test` (expect only the pre-existing
  `voice.transcribe` failure), `pnpm build` all pass. The Home/TTS page still
  loads.

Report results; fix every real failure; keep commits small.

## Step 3 — Deploy to the VPS with HTTPS (required!)

`getUserMedia`/`getDisplayMedia` only work in a **secure context** — HTTPS (or
localhost). The VPS MUST serve over TLS or capture silently fails.

1. On the VPS: install Node 22 + pnpm, clone the branch, provide the same env (+ a
   real MySQL), `pnpm install && pnpm db:push && pnpm build && pnpm start` (honors
   `PORT`).
2. Put it behind a TLS reverse proxy — **Caddy** is simplest (automatic Let's
   Encrypt): a `Caddyfile` reverse-proxying your domain to `127.0.0.1:<PORT>`.
   Ensure SSE isn't buffered (the route sets `X-Accel-Buffering: no`; with nginx
   also set `proxy_buffering off` for `/api/interview/live/stream`). Keep the app
   bound to localhost; only the proxy is public.
3. Re-run the Step 2 checklist against the HTTPS URL in Chrome.

## Step 4 — Enhancement: cross-device answers channel (phone as teleprompter)

Today the answers page syncs via `localStorage` (same browser only). With the VPS
you can make the **phone** the teleprompter:

- Add a server-backed pub/sub keyed by a short **pairing code**: control page
  `POST /api/interview/answers/publish?code=XYZ` with the reduced state; answers
  page `GET /api/interview/answers/stream?code=XYZ` (SSE) receives it. Keep state
  **in-memory** on the server (single-user; a `Map<code, AnswersState>` with a
  TTL is fine) — do not persist transcripts to disk.
- Reuse the existing pure reducer/types in `shared/interview/liveChannel.ts`
  unchanged. Add a transport that prefers the server channel and **falls back to
  `localStorage`** when no code is set, so same-browser still works offline.
- Show the pairing code + a QR link on the control page; open
  `/interview/answers?code=XYZ` on the phone.
- Gate behind the live flag. Add unit tests for any new pure logic (code
  validation, TTL expiry, reducer integration). Update `docs/interview-copilot.md`.

## Guardrails & conventions

- Keep `pnpm check`, `pnpm test`, `pnpm build` green before every commit. Put real
  logic in **pure modules** with **vitest** tests that can actually fail (match
  the existing `shared/interview/*` + `server/interview/*.test.ts` style). A test
  that can't fail is worse than none — delete it and say the behavior is
  uncovered.
- Don't break the existing TTS "Listen" page or the `tts.*`/`voice.*`/`auth.*`
  routers.
- Never log or store raw résumé/JD/answer/transcript text — use the
  `redact`/`interviewLog` helpers; practice answers stay hashed.
- Keep the feature behind its flags; keep live capture consent-gated, visible, and
  stoppable.
- When you change the API surface or behavior, update `docs/interview-copilot.md`
  in the same commit.
- Commit in small logical units with clear messages; push to
  `feat/interview-copilot` (PR #1). Ask before merging.

## Known limitations / deferred (context, not blockers)

- Transcription is batch `whisper-1` + pseudo-streaming; provider-native streaming
  STT (`gpt-4o-transcribe` SSE) is optional and only if the provider supports it.
- SQL Lab generates + safety-classifies but does **not** execute SQL (isolated
  validation deferred).
- No Chrome `tabCapture` extension yet (uses `getDisplayMedia`).

**First:** confirm the provider option (A or B), then do Step 1 and report what
actually happens when it hits real DB + LLM calls.
