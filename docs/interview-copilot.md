# Interview Copilot

An interview-preparation feature built on the existing TTS module's auth,
workspace, storage, LLM, and redaction patterns. It is delivered as a
separately gated feature and leaves the Listen panel untouched.

> This is the MVP cut of
> [`interview-copilot-plan.md`](../interview-copilot-plan.md): **Prepare**,
> **Practice**, and **SQL lab**. **Live assist** is implemented but kept behind
> its own flag, off, until consent/retention/deletion controls are complete, as
> the plan requires.

## Feature flags

Both default **off**. The feature is invisible and all procedures return
`NOT_FOUND` until enabled. Enabling the copilot never enables live capture.

```bash
INTERVIEW_COPILOT_ENABLED=true      # Prepare + Practice + SQL lab
INTERVIEW_LIVE_ASSIST_ENABLED=true  # adds live.suggest; requires the flag above
```

## Provider (LLM + transcription)

The server talks to any OpenAI-compatible provider at `BUILT_IN_FORGE_API_URL`.
Manus Forge and plain OpenAI both work:

```bash
BUILT_IN_FORGE_API_URL=https://api.openai.com   # or your Forge URL
BUILT_IN_FORGE_API_KEY=sk-...
LLM_MODEL=gpt-4.1-mini            # optional; defaults to gpt-4.1-mini on api.openai.com,
                                  # provider default elsewhere (Forge picks one)
TRANSCRIPTION_MODEL=whisper-1     # optional; gpt-4o-transcribe also works (json, no segments)
```

Transcription (`interview.live.transcribeSegment` and `voice.transcribe`) uses
`transcribeBytes()` in `server/_core/voiceTranscription.ts`: the audio bytes are
multipart-POSTed **directly** to `/v1/audio/transcriptions`. There is no object
storage hop, so interview audio is never written anywhere. Model/URL resolution
lives in the pure `server/_core/providerConfig.ts`. Object storage is still
Forge-only, so the TTS Listen panel's audio playback needs Forge.

Structured outputs are sent in OpenAI **strict** mode
(`server/interview/strictSchema.ts`): every object is closed and every property
required, with optional fields made nullable; `parseModelJson` strips the nulls
before the Zod pass. Without strict mode OpenAI treats the schema as a hint and
roughly 1 in 4 long briefs failed validation (missing fields, invalid enums).

### Smoke test

`scripts/smoke-interview.ts` runs the whole API flow against a live server with
real DB + LLM calls, in a throwaway workspace, printing only sizes and flags:

```bash
BASE_URL=http://localhost:3000 SMOKE_AUDIO=./clip.webm pnpm smoke:interview
```

The client reads `trpc.interview.config` and renders nothing but an "off"
notice unless `enabled` is true. The route lives at `/interview`.

## Modes

| Mode | Capture | What it does |
|---|---|---|
| **Prepare** | Paste only, no mic | Extracts a structured, evidence-linked brief from a JD + resume |
| **Practice** | Typed (mic reuses the existing `voice.transcribe`) | Rubric feedback on an answer; flags unsupported claims |
| **SQL lab** | Typed | Generates a solution + explanation and classifies it read-only |
| **Live assist** | Gated, off | Short grounded suggestion from the approved brief |
| **Present** | Paste only, no mic | Script/slide notes → cue cards (say, transition, seconds) on a full-screen prompter |

## tRPC procedures

All are workspace-scoped (`workspaceId` defaults to the caller's personal
workspace) and gated by `INTERVIEW_COPILOT_ENABLED`.

| Procedure | Auth | Purpose |
|---|---|---|
| `interview.config` | Public | Feature flags, SQL dialects, categories, prompt version |
| `interview.materials.create` | Protected | Store pasted JD/resume/project/notes text |
| `interview.materials.list` | Protected | Metadata only (never the text) |
| `interview.materials.delete` | Protected | Soft-delete: null the text, keep the audit row |
| `interview.brief.generate` | Protected | LLM extraction of the brief from active materials (resets to draft) |
| `interview.brief.get` | Protected | The brief + approval state |
| `interview.brief.approve` | Protected | Marks the brief verified; nothing downstream uses a draft |
| `interview.practice.questions` | Protected | Questions from the **approved** brief |
| `interview.practice.submitAnswer` | Protected | Rubric feedback; stores the answer as a hash only |
| `interview.sql.generate` | Protected | Structured SQL answer + read-only safety classification |
| `interview.sql.check` | Protected | Pure read-only safety check for user-pasted SQL (no LLM, no execution) |
| `interview.present.generate` | Copilot flag | Script/slide notes → cue-card deck (`llm` or local-chunker fallback); nothing stored |
| `interview.live.transcribeSegment` | 2nd flag | Transcribe one utterance chunk from one stream (`candidate` or `interviewer`) |
| `interview.live.suggest` | 2nd flag | Grounded live suggestion, with recent turns as context |

(Auth note: this build is single-user by choice — procedures are `publicProcedure`;
a shared `solo` workspace is used when no session is present.)

## Data flow (Prepare → Practice)

```
Paste JD/resume ──> interview_materials (text, workspace-scoped)
                       │
      brief.generate ──┤ typed-delimited, untrusted-data prompt ──> invokeLLM
                       │                                              │
                       └──< strict JSON schema, Zod-validated <───────┘
                                     │
                       interview_briefs (draft)
                                     │ user reviews + approve
                                     ▼
                       interview_briefs (approved)
                                     │
      practice.submitAnswer ─────────┤ compact relevant context ──> invokeLLM
                                     │                               │
                       feedback (unsupported claims flagged) <───────┘
                       interview_practice_turns (answer HASH only)
```

## Grounding and truthfulness

- Materials are delimited (`JD_DATA`, `RESUME_DATA`, `USER_QUESTION`) and marked
  untrusted; the model is told to ignore instructions embedded in them.
- Every model response is parsed and re-validated with Zod; malformed output
  fails closed (`MODEL_OUTPUT_MALFORMED`).
- Live suggestions pass through `groundSuggestion`: evidence referencing an id
  not in the approved brief is dropped and surfaced as an unsupported claim, and
  `shouldVerify` / confidence are forced down whenever anything is unverified.

## Live assist — dual-stream capture (behind `INTERVIEW_LIVE_ASSIST_ENABLED`)

Speaker attribution is by construction, not diarization: two physically
separate sources are captured and never mixed.

```
Your mic   (getUserMedia)        ──► "candidate"   transcript   (your answers)
Interview tab/system audio
   (getDisplayMedia; tabCapture
    extension later)              ──► "interviewer" transcript   ──► drives suggestions
```

- **VAD-gated capture** (`useDualStreamCapture`): each stream records only while
  someone speaks (RMS threshold + a silence tail), emitting one utterance-aligned
  chunk per turn — fewer transcription calls, cleaner turn boundaries.
- **Pseudo-streaming STT**: during the interviewer's turn the hook emits rolling
  *partial* chunks (everything from the utterance start to now — a valid file,
  since it includes the container header), transcribed to an updating interim
  transcript. At the pause the interim is **optimistically committed** so the
  planner fires without waiting for a fresh transcription, then the accurate
  final transcription replaces it (the planner's `refine` path re-answers if the
  corrected text differs). Partials are dropped while one is in flight and only
  run on the interviewer stream. This removes the post-pause transcription wait
  without needing a provider-native streaming STT model.
- **The planner** (`shared/interview/liveSession.ts`, pure + unit-tested) decides
  when to answer: it waits for the interviewer's pause, assembles the question
  from the trailing turn, and classifies it as **new**, a **repeat/clarification**
  to re-answer with the clearer text, or an **echo** to skip (token-similarity).
- **Turn context**: recent turns (both sources) are passed to `suggest` so a
  clarification is understood in context.
- **Token streaming**: `POST /api/interview/live/stream` (SSE) streams the answer
  token-by-token so the first words appear in a few hundred ms. The client
  renders the streaming text via a tolerant partial-JSON reader
  (`shared/interview/streamingJson.ts`, unit-tested) and swaps in the fully
  **grounded** structured suggestion when the `final` frame arrives — grounding
  is never traded for speed. Falls back to the batch `live.suggest` if the
  stream is unavailable.
- **Consent + control**: a preflight acknowledgement gates capture; a visible
  "Listening" state, Stop, and Clear-session controls are always present.

## Two-window setup (control + answers)

Live assist is split across two surfaces:

- **Control window** — the Live tab at `/interview`. The only surface that
  captures audio, transcribes, and calls the model. "Open answers window" opens
  the second page.
- **Answers window** — `/interview/answers`, receive-only. A big, calm
  teleprompter showing the current question, the direct answer + bullets to say,
  confidence, "verify before stating as fact" warnings, and a history of earlier
  questions. It never captures audio, so there is no double-capture.

**Transport** is a `localStorage` snapshot + the `storage` event
(`shared/interview/liveChannel.ts`, pure + unit-tested): the control window
writes a reduced snapshot on each turn (`start → stream → final`, plus
`status`/`clear`), and the answers window — a separate window/tab on the same
browser — seeds from it on open and updates on `storage` events. This needs no
server, survives reload, and lets the answers window be opened at any time and
immediately show current state. Streaming writes are throttled.

Scope: same browser (a second window or monitor — the usual teleprompter setup).
A different *device* would need a server-backed channel (SSE/WebSocket); that is
the documented upgrade path.

## Present — presentation prompter

The Present tab at `/interview` turns a pasted talk script or slide notes into
cue cards (`interview.present.generate`, strict-schema LLM with a deterministic
local-chunker fallback that only splits the speaker's own words). Cards carry a
title, the words to say, a transition line, and a seconds budget, optionally
rescaled to a target talk length. The full-screen prompter at
`/interview/present` shows the current cue large, the next cue small, elapsed
vs. budget timing, and progress. Advance with Space/ArrowRight, screen-edge
clicks, or the control tab; both windows sync through the same localStorage
channel pattern as Answers (`shared/interview/presentChannel.ts`, unit-tested).
Nothing is stored server-side in card mode.

**Live Scroll** (in the prompter) is the speech-following mode: the presenter's
mic is transcribed in rolling chunks and each transcript is aligned against the
script word stream (`shared/interview/scrollFollow.ts`, unit-tested LCS
alignment over a forward window). The scroll moves to the sentence being
spoken, holds when speech stops, jumps when the speaker skips ahead, and —
when speech matches nothing — flags off-course and offers a bridge line back
to the missed point. Any sentence can be clicked to jump manually. Audio is
transcribed via `interview.live.transcribeSegment` and never stored.

## SQL safety

The MVP **never executes SQL**. `checkReadOnlySql` tokenizes a query (stripping
comments, blanking string/identifier literals), then requires a single
statement beginning with `SELECT`/`WITH` and rejects DDL/DML, multiple
statements, comment- or literal-smuggled statements, and file/network/shell
functions. It fails closed and is the guard any future isolated executor must
reuse. See `server/interview/sql-engine.test.ts` for the adversarial cases.

## Privacy

- Practice answers are stored as a SHA-256 **hash** plus the feedback; the raw
  answer never reaches the database or logs.
- `interviewLog` / `redact` drop content-bearing keys at any depth before any
  structured log line is written.
- Live audio chunks are sent straight to the transcription provider and never
  stored.
- Material delete nulls the stored text. The managed storage helper still
  exposes no object delete; the MVP is paste-only, so no files are written to
  object storage and nulling the row is the hard delete of the content.
- `interview_audit_events` records non-content events only.

## Deferred (see the plan)

PDF file-upload parsing (Setup accepts paste and client-side .md/.txt upload today; files are read as text in the browser and sent through the same materials API), isolated read-only SQL **execution**/validation,
**provider-native streaming STT** (transcription defaults to batch `whisper-1`;
pseudo-streaming above fills the gap. A `gpt-4o-transcribe` `stream:true` SSE
path is possible with OpenAI but not built), the Chrome `tabCapture` extension and native
desktop capture, provider failover/circuit breakers, a storage cleanup worker,
and the broad public release of Live assist.

## Database

Migration `drizzle/0002_*.sql` adds `interview_materials`, `interview_briefs`,
`interview_practice_turns`, `interview_sql_cases`, and
`interview_audit_events`. Apply with `pnpm db:push` against the managed
database.
