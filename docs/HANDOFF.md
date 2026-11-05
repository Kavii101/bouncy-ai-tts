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

## Step 3 — Deploy to the VPS (real model — read before touching the box)

`getUserMedia`/`getDisplayMedia` only work in a **secure context** — HTTPS (or
localhost). The VPS MUST serve this app over TLS (the host nginx provides it) or
capture silently fails.

### Cross-repo reality (important)
This app (`Kavii101/bouncy-ai-tts`) is a **separate repo** from the monorepo
whose VPS this is (`BAI-monorepo-Manus`). The box's existing auto-deploy watches
the **monorepo's** `main`, so it will NOT pick up this repo. You must **add this
app to the box by hand**: its own container(s) in the `bai` compose project, a
free host port, its own nginx server block + domain, and its own MySQL. Decide
with the user whether to also wire an auto-deploy path for it later.

### The deploy references live on the user's Mac (monorepo), not in this repo
A session running **on the Mac** (with `/Users/primus/Documents/BAI-monorepo-Manus-main/`
and `~/.claude/.../memory/*.md`) can read them; a cloud/other-machine session
cannot and must rely on the repo files + the SSH line below. Read these first, in
order, and treat `deploy/README.md` and `DEPLOYMENT.md` as **outdated**
(early shared-Atlas setup, old ports) — background only:

1. `~/.claude/projects/-Users-primus-Documents-BAI-monorepo-Manus-main/memory/vps-ssh-root-access.md` — SSH command, key, where the app lives, what the safety check blocks.
2. `~/.claude/.../memory/vps-auto-deploy-cadence.md` — merge-to-main → live in minutes via a 3-min timer; deploy log + marker locations.
3. `~/.claude/.../memory/vps-cpu-throttled.md` — 2-core box, already CPU-throttled; **build images off-box** (see PR #287); `deploy/apply-cpu-limits.sh` sets per-container limits.
4. `~/.claude/.../memory/mongo-on-atlas.md` — MongoDB is on Atlas; the local Mongo container and n8n are gone — **don't restart n8n**. (This app uses MySQL, not Mongo, but know the box state.)
5. `deploy/PORTS.md` — taken host ports; pick a free one and **update this file**. Note the 3010 warning.
6. `deploy/DEPLOY-GOTCHAS.md` — the four things that broke the first deploy. Main one: **containers can't reach the host's own public IP — use Docker network names instead.**
7. `deploy/docker-compose.bai.yml` — compose project `bai`, network `bai-net`, current containers.
8. `deploy/auto-deploy.sh` (+ `deploy/auto-deploy.service`, `deploy/auto-deploy.timer`) — the deploy script + timer.
9. `deploy/nginx/app.bountyai.online.conf` — copy this for the new domain. **nginx runs directly on the host, not in Docker, configured by hand.**

### SSH
`ssh -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@141.136.42.226`
Use **root** (ubuntu@ is refused).

### 🚫 ISOLATION RULE (hard requirement from the owner)
**Do not touch, modify, stop, restart, or reconfigure any existing app or
container on the VPS.** This app must be **fully self-contained and new**:
- Its **own** Docker Compose project and **own** network — do NOT add services to
  the existing `bai` project or attach to `bai-net`. Read `docker-compose.bai.yml`
  only to learn conventions and avoid name/port collisions.
- Its **own** MySQL container inside its own project (don't reuse another app's
  DB), or a separate managed DB.
- A **new, unused** host port (check `deploy/PORTS.md`, append your entry — do not
  repurpose a port another app uses).
- A **new** nginx server block + **new** domain/subdomain (copy the template to a
  new file; don't edit another app's server block).
- Never stop/restart `n8n`, Mongo, or any current container; never edit the shared
  compose/timer/service files. If something seems to require touching existing
  infra, STOP and ask the owner instead.
- Read the host's auto-deploy/timer files for awareness only; this app is deployed
  **manually** and must not be wired into the monorepo's auto-deploy without the
  owner's say-so.

### Config that can intertwine — VERIFY each is free before deploying
Do not assume; check against the live box AND the committed files, then record
your choices. Nothing below may reuse a value another app holds.

| Thing | Collision risk | How to verify it's free |
|---|---|---|
| **Host port** for the app | Another app/container already binds it | `ssh … 'ss -tlnp'` (list listening host ports) **and** read `deploy/PORTS.md`. Pick a port in **neither**. **Avoid 3010** (documented warning). Prefer **≥ 3020**: the app auto-scans 3000–3019 (next point), so staying above that range can't clash with its own scan. Append your chosen port to `PORTS.md`. |
| **App's internal PORT** | App's `findAvailablePort` scans `PORT`→`PORT+19`; if unset it starts at 3000 and silently walks upward | **Always set `PORT` explicitly** in the container env and map exactly that one container port to your chosen host port. Never let it auto-scan on the host. |
| **MySQL 3306** | Host already runs a MySQL on 3306 | Keep the app's MySQL **internal only** — don't publish 3306 to the host at all. |
| **Compose project name** | Clashes with `bai` or another project | `docker compose ls` — pick a new unique name (e.g. `interview-copilot`). |
| **Docker network name** | Clashes with `bai-net` | `docker network ls` — new unique name (e.g. `interview-copilot-net`). |
| **Container names** | Clashes with existing containers | `docker ps -a --format '{{.Names}}'` — new unique names. |
| **nginx `server_name` / domain** | Duplicate server_name silently shadows another vhost | `grep -rn server_name /etc/nginx` — pick a brand-new subdomain, new conf file; don't edit an existing block. |
| **TLS cert path / webroot** | Overwrites another site's cert | Use the new domain's own cert; don't reuse another site's files. |

Suggested (but still verify free): host port ≥ 3020, project `interview-copilot`,
network `interview-copilot-net`, containers `interview-copilot-web` /
`interview-copilot-mysql`, domain e.g. `interview.<your-domain>`. If any is
taken, pick another — do not displace an existing app.

### Deploy steps for THIS app
1. **Build the image off-box** (the VPS is CPU-throttled): build on the Mac/CI and push to a registry the box can pull, or build and `docker save | ssh … docker load`. Don't `docker build` on the VPS.
2. Stand up a **NEW, isolated** compose project with its **own** network — not
   `bai`/`bai-net`: the Node app container + its own **MySQL** container (or a
   managed MySQL). Keep MySQL **internal** (do NOT publish 3306 to the host — the
   app reaches it by Docker service name on the project's own network, avoiding
   any host 3306 collision). Run the Drizzle migration (`pnpm db:push`, or apply
   `drizzle/0002_*.sql`) against that MySQL. Set the env from Step 1
   (`DATABASE_URL` points at the MySQL **by its Docker service name**, not the
   host IP — see gotchas).
3. Pick a **free host port from `deploy/PORTS.md`**, map the app container to it, and **update PORTS.md**.
4. Add an **nginx server block** on the host (copy `deploy/nginx/app.bountyai.online.conf` to a new domain) that terminates TLS and reverse-proxies to the app's host port. For the SSE route, disable buffering: `location /api/interview/live/stream { proxy_buffering off; proxy_cache off; add_header X-Accel-Buffering no; proxy_pass … }` (the route already sets `X-Accel-Buffering: no`). Reload nginx.
5. Point the new domain's DNS at the box; issue/renew TLS (per the existing nginx/Let's Encrypt setup on the host).
6. Re-run the **Step 2** acceptance checklist against the HTTPS URL in Chrome.

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
