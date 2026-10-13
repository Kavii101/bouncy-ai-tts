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

The client reads `trpc.interview.config` and renders nothing but an "off"
notice unless `enabled` is true. The route lives at `/interview`.

## Modes

| Mode | Capture | What it does |
|---|---|---|
| **Prepare** | Paste only, no mic | Extracts a structured, evidence-linked brief from a JD + resume |
| **Practice** | Typed (mic reuses the existing `voice.transcribe`) | Rubric feedback on an answer; flags unsupported claims |
| **SQL lab** | Typed | Generates a solution + explanation and classifies it read-only |
| **Live assist** | Gated, off | Short grounded suggestion from the approved brief |

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
| `interview.live.suggest` | Protected, 2nd flag | Grounded live suggestion (off by default) |

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
- Material delete nulls the stored text. The managed storage helper still
  exposes no object delete; the MVP is paste-only, so no files are written to
  object storage and nulling the row is the hard delete of the content.
- `interview_audit_events` records non-content events only.

## Deferred (see the plan)

File-upload parsing, isolated read-only SQL **execution**/validation, the live
transcription UI, multi-stream capture, the Chrome extension, provider
failover/circuit breakers, a storage cleanup worker, and the broad public
release of Live assist.

## Database

Migration `drizzle/0002_*.sql` adds `interview_materials`, `interview_briefs`,
`interview_practice_turns`, `interview_sql_cases`, and
`interview_audit_events`. Apply with `pnpm db:push` against the managed
database.
