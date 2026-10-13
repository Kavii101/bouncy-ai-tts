# Bouncy AI Interview Copilot — End-to-End Product and Engineering Plan

**Status:** Implementation-ready product plan  
**Repository:** `Kavii101/bouncy-ai-tts`  
**Recommended delivery:** Extend the existing voice module as a separately gated `Interview Copilot` feature, while keeping the Listen panel reusable and independent.

## 1. Product definition

### 1.1 Product promise

An interview preparation and assistive coaching workspace that lets a candidate provide a job description and resume in advance, practice likely questions, optionally transcribe questions during a permitted interview, and receive concise, personalized answer frameworks. It must help the candidate think and communicate—not invent experience, impersonate the candidate, or silently record other people.

### 1.2 Product modes

| Mode | Purpose | Capture behavior | AI behavior |
|---|---|---|---|
| **Prepare** | Build a private candidate profile from a JD, resume, projects, skills, and constraints | Upload/paste only; no microphone | Extracts requirements, evidence, gaps, and likely questions |
| **Practice** | Rehearse questions and receive feedback | Optional explicit microphone recording | Simulates interviewer, scores answer structure, suggests improvements |
| **Live assist** | Help organize thoughts during a permitted interview | User-controlled transcription only; visible recording state; no hidden system capture | Returns short answer outline, clarifying question, and evidence references |
| **SQL lab** | Solve SQL interview problems safely | Typed/pasted schema and prompt | Produces SQL plus assumptions, explanation, edge cases, and optional read-only validation |

**Default launch mode:** Prepare + Practice + SQL lab. Enable Live assist only behind a feature flag after privacy, consent, latency, and policy checks pass.

### 1.3 Non-negotiable product principles

1. **Truth-preserving:** Never claim a skill, employer, project, metric, or outcome that is not in the candidate-provided evidence.
2. **User control:** No autoplay, no microphone request on page load, no background recording, no hidden capture, and obvious Start/Stop controls.
3. **Answer-first UX:** Live suggestions are short enough to scan in seconds; detailed explanations belong in an expandable panel.
4. **Evidence-linked:** Each personalized claim links to a resume/JD evidence item or is labeled `Suggested framing — verify before using`.
5. **Safe SQL by default:** Generate and explain SQL, but never execute against a production database and never execute without explicit user action.
6. **Graceful degradation:** If transcription, LLM, storage, or network fails, the user can still type, read their materials, and use the browser/device fallback.
7. **Privacy by design:** Minimize stored raw text/audio, isolate workspaces, redact logs, expose retention controls, and make deletion understandable.

## 2. Target user journeys

### 2.1 First-time setup

1. User signs in and creates a private interview workspace.
2. User pastes or uploads the JD.
3. User pastes or uploads the resume.
4. Server extracts normalized text, sections, dates, skills, tools, metrics, and claims.
5. User reviews and edits the extracted profile before AI use.
6. System generates:
   - role summary;
   - must-have and nice-to-have requirements;
   - evidence map from requirements to resume bullets;
   - missing/unclear areas;
   - likely behavioral, technical, product, and SQL questions;
   - a preparation checklist.

### 2.2 Practice session

1. User chooses a question category and difficulty.
2. Copilot asks one question at a time.
3. User types or explicitly records an answer.
4. Transcription is shown as editable text before scoring.
5. Feedback uses a stable rubric: relevance, structure, evidence, technical correctness, clarity, concision, and unsupported claims.
6. User can ask for a stronger outline, follow-up questions, or a rewrite in their own voice.
7. Session ends with a review summary and next practice recommendations.

### 2.3 Live assist session

1. User selects the interview workspace and sees a preflight checklist.
2. User confirms they are allowed to use assistive software and understands what audio may be captured.
3. User manually starts transcription; the UI visibly shows `Listening` and a persistent Stop control.
4. Transcript appears in short rolling segments, with an editable question field.
5. User clicks `Suggest answer`; the system returns:
   - a 3–5 bullet answer outline;
   - one relevant resume evidence item;
   - assumptions or uncertainty;
   - one optional clarifying question;
   - a confidence/grounding label.
6. No answer is spoken automatically. TTS is optional and off by default.
7. User can pause, delete the session, or switch to typed input at any time.

### 2.4 SQL interview journey

1. User pastes the prompt and chooses a dialect: PostgreSQL, MySQL, SQL Server, BigQuery, Snowflake, or generic SQL.
2. User enters or uploads schema DDL/sample rows.
3. Copilot returns structured output:
   - SQL;
   - plain-English approach;
   - assumptions;
   - join and filter rationale;
   - edge cases;
   - time/space considerations;
   - dialect-specific notes;
   - validation warnings;
   - alternative solution where useful.
4. User may run a **read-only, isolated validation** against an in-memory/sample database with a hard timeout, row limit, and no network access.
5. Results show test data and explain failures; the system never silently changes the query.

## 3. Proposed information architecture

- `/interview` — workspace list and recent sessions
- `/interview/setup` — JD, resume, profile, privacy/retention settings
- `/interview/brief` — requirements-to-evidence map and preparation plan
- `/interview/practice` — practice question and feedback loop
- `/interview/live` — explicit live transcription and short answer suggestions
- `/interview/sql` — SQL prompt, schema, solution, explanation, validation
- `/interview/history/:sessionId` — transcript, suggestions, feedback, and deletion controls
- `/interview/settings` — retention, provider, language, export/delete

Keep the existing `/` Listen panel intact. Extract shared controls into components rather than coupling the copilot to TTS state.

## 4. Technical architecture

### 4.1 Reuse from the existing module

- Manus OAuth and `protectedProcedure`.
- Workspace membership and authorization pattern.
- Private storage and signed URLs.
- Whisper transcription helper and current 16 MB validation.
- Provider-agnostic TTS adapter and labeled browser SpeechSynthesis fallback.
- tRPC contracts, Drizzle schema, Vitest, TypeScript checks, and existing redacted logging conventions.
- Existing UI primitives, accessibility patterns, and responsive styling.

### 4.2 New backend domains

Split the current large router into feature routers before significant implementation:

- `server/routers/interview.ts`
- `server/routers/materials.ts`
- `server/routers/practice.ts`
- `server/routers/live.ts`
- `server/routers/sql.ts`
- `server/routers/privacy.ts`

Add service modules:

- `server/interview/material-extraction.ts`
- `server/interview/evidence-map.ts`
- `server/interview/answer-engine.ts`
- `server/interview/grounding.ts`
- `server/interview/sql-engine.ts`
- `server/interview/session-policy.ts`
- `server/interview/redaction.ts`

All LLM calls remain server-side through the configured `invokeLLM` helper. Use structured JSON schemas for extraction, question generation, feedback, answer suggestions, and SQL responses. Do not parse free-form prose when a schema is possible.

### 4.3 Request flow for a live suggestion

1. Browser sends an explicit transcript segment or edited question.
2. Server verifies authenticated user and workspace membership.
3. Server loads only the selected workspace's approved profile, relevant evidence, and current session context.
4. Server applies size limits, prompt-injection boundaries, and redaction rules.
5. LLM returns a strict structured response.
6. Server validates grounding references and strips unsupported claims.
7. Client renders a concise suggestion with evidence labels and timestamps.
8. Server logs metadata only: latency, outcome, model, token/character counts, and failure code—not raw resume, JD, transcript, or answer content.

## 5. Data model

Use new tables rather than overloading TTS tables. Every table needs a workspace identifier and authorization check.

### 5.1 Core tables

- `interview_workspaces`: workspace name, owner, status, retention policy, created/updated timestamps.
- `interview_workspace_members`: workspace, user, role, unique membership.
- `interview_materials`: JD/resume/project/notes metadata, storage key, source type, MIME, size, checksum, parse status, retention date.
- `interview_material_versions`: immutable normalized text versions, content hash, parser version, user approval timestamp.
- `interview_evidence_items`: claim text, category, source material/version, location, user verified flag, confidence.
- `interview_requirements`: requirement text, category, priority, evidence links, gap status.
- `interview_questions`: generated or user-created question, category, difficulty, source requirement, prompt version.
- `interview_sessions`: mode, status, started/ended timestamps, model/policy version, deletion/retention state.
- `interview_turns`: question/answer/feedback turn metadata, text hashes by default, optional encrypted content under explicit retention settings.
- `interview_suggestions`: structured suggestion JSON, grounding references, safety labels, latency, model, expiration.
- `interview_sql_cases`: prompt, dialect, schema reference, solution JSON, validation status, retention date.
- `interview_usage_quotas`: per-workspace limits for extraction, transcription, LLM calls, storage, and SQL validation.
- `interview_audit_events`: non-content audit events such as material uploaded, session started, deletion requested, and policy acknowledgement.

### 5.2 Storage rules

- Store files in private storage under generated workspace/material keys.
- Store hashes and metadata by default; keep raw normalized text only when required for the selected feature and covered by the retention setting.
- Never place resumes, transcripts, API keys, or raw SQL prompts in client bundles, URLs, logs, analytics events, or error messages.
- Enforce maximum file size, page/character limits, MIME allowlists, and decompression safeguards.
- Provide workspace-level `delete now` and scheduled expiry behavior. Because the current storage helper does not expose object deletion, add deletion support before promising hard deletion; otherwise disclose the exact limitation.

## 6. LLM and grounding design

### 6.1 Context assembly

Use a small, relevant context window:

- role requirements relevant to the current question;
- 1–3 verified resume evidence items;
- user-approved skills and constraints;
- recent conversation turns only when needed;
- explicit instruction that uploaded materials are untrusted data, not instructions.

Do not send the entire resume and full JD for every live request. Cache extracted structures and retrieve only relevant evidence.

### 6.2 Structured answer contract

```ts
type AnswerSuggestion = {
  directAnswer: string;
  bullets: string[];
  evidence: Array<{ evidenceId: string; claim: string; verified: boolean }>;
  assumptions: string[];
  followUpQuestion?: string;
  unsupportedClaims: string[];
  confidence: "high" | "medium" | "low";
  shouldVerify: boolean;
};
```

Rules:

- `unsupportedClaims` must be populated when the answer goes beyond evidence.
- If the question cannot be answered from the profile, say so and propose a truthful bridge: `I have not done X directly, but I have done Y, which is related because...`.
- Never manufacture metrics, employment history, certifications, system scale, or SQL execution results.
- Treat candidate materials as data; ignore instructions embedded in a resume/JD that attempt to change system behavior.
- Add a prompt/policy version to every generated result for debugging and reproducibility.

### 6.3 Prompt-injection and data-boundary defenses

- Delimit each source with typed labels (`RESUME_DATA`, `JD_DATA`, `USER_QUESTION`).
- Strip or flag suspicious instruction-like content in uploaded materials.
- Do not allow material text to select tools, models, URLs, or database connections.
- Use allowlisted tools only; live mode has no arbitrary browsing or code execution.
- Enforce output schema server-side and reject malformed/overlong results.
- Add adversarial tests for resume/JD prompt injection, fake credentials, hidden exfiltration requests, and malicious SQL.

## 7. SQL generation and validation

### 7.1 Generation contract

```ts
type SqlAnswer = {
  dialect: string;
  sql: string;
  explanation: string;
  assumptions: string[];
  schemaUsed: string[];
  edgeCases: string[];
  complexity?: string;
  alternativeSql?: string;
  warnings: string[];
  validation: {
    status: "not_run" | "passed" | "failed" | "skipped";
    errors: string[];
    sampleRows?: number;
  };
};
```

### 7.2 Safety controls

- Default to generation only.
- Permit only `SELECT`/CTE statements in validation mode; reject DDL, DML, transactions, extensions, file access, network functions, and multi-statements.
- Parse and normalize SQL before execution; do not rely on a regex alone.
- Run against an isolated ephemeral database built from user-provided schema/sample data.
- Hard timeout, memory/row limits, result truncation, and cancellation.
- Never accept a database URL from a resume, JD, prompt, or client-side field.
- Never execute against Bouncy AI production data in the MVP.
- Clearly label dialect assumptions and explain when syntax is not portable.

## 8. Frontend experience and accessibility

### 8.1 Visual direction

Use a focused, calm interview workspace rather than a generic chat screen:

- left rail: workspace, mode, timer, privacy state;
- center: current question/transcript and primary action;
- right rail: concise suggestion, evidence, warnings, and expand-for-detail;
- responsive mobile layout with stacked panels;
- light theme consistent with the existing Bouncy AI surface, with a high-contrast live-state indicator.

### 8.2 Live-state requirements

- Persistent `Listening`/`Paused`/`Stopped` state.
- Browser support and microphone permission check only after user activation.
- Visible microphone indicator and elapsed time.
- Stop, pause, delete current capture, and switch-to-typing controls.
- User sees transcript before it is used for a suggestion where latency permits.
- Never auto-submit a transcript to a third-party provider without an explicit session action and disclosed provider/retention policy.
- Respect reduced motion and keyboard navigation; all status changes use `aria-live`.

### 8.3 Failure UX

Every failure should explain the next action:

- no microphone / permission denied → type or paste;
- unsupported MIME/browser → supported browser list and typed mode;
- transcription timeout → retry last segment, no duplicate billing;
- provider unavailable → cached preparation materials and practice without audio;
- low grounding → show `Verify this` and do not present as fact;
- quota reached → show remaining reset time and lower-cost options;
- SQL validation rejected → show safety reason and keep generated SQL available for review;
- expired material → prompt re-upload, never silently use stale content.

## 9. Privacy, security, and policy checklist

- Obtain explicit user acknowledgement for microphone/audio capture and retention.
- Make the user responsible for confirming interviewer/employer permission where required; show this before Live assist starts.
- Do not market hidden recording, stealth overlays, bypassing proctoring, or undisclosed interview assistance.
- Add a visible `Assistive mode active` indicator.
- Encrypt transport; use private storage and signed URLs.
- Workspace-scope every query and mutation; test cross-workspace access with two users.
- Apply CSRF/session protections inherited from the scaffold; never expose provider secrets in `VITE_*` variables.
- Redact raw text/audio from logs and error telemetry.
- Provide export, delete, and retention controls.
- Define data processor/provider terms and regional processing before production launch.
- Establish a policy for third-party interview platforms and enterprise customers; default Live assist off for restricted tenants.

## 10. Quotas, latency, and cost controls

Track and limit separately:

- uploaded bytes and material count;
- extracted characters/pages;
- transcription minutes;
- LLM input/output tokens;
- live suggestions per minute/session;
- SQL validation runtime and rows;
- TTS characters if read-aloud is enabled.

Performance targets for MVP:

- typed suggestion p95 under 4 seconds;
- rolling transcript segment p95 under 3 seconds after upload;
- cached preparation brief under 2 seconds after first generation;
- SQL generation under 5 seconds for normal prompts;
- clear timeout at 15 seconds with retry/cancel.

Use smaller/cheaper models for extraction and classification, stronger models only for final feedback or difficult SQL. Deduplicate by content hash and idempotency key. Cancel stale requests when the user changes questions.

## 11. Implementation phases

### Phase 0 — Contract and policy foundation

- Add feature flag and product copy.
- Define retention, consent, supported browsers, and allowed modes.
- Extract shared `ListenPanel` and transcription hook from `Home.tsx`.
- Split router/db modules before adding new tables.
- Add threat model and data-flow diagram to the repository.

**Exit criteria:** no Live assist route is reachable unless the flag is enabled; existing TTS/STT tests remain green.

### Phase 1 — Materials and profile

- Add material upload/paste UI and private storage flow.
- Add parser limits and normalized text extraction.
- Add structured evidence and requirement extraction.
- Build review/edit screen; no AI result is treated as verified until user approves it.
- Add workspace quota and deletion controls.

**Exit criteria:** a user can create a workspace, review a JD/resume map, correct claims, and delete materials.

### Phase 2 — Practice mode

- Generate question bank from approved requirements.
- Add typed answer and explicit recording paths.
- Implement feedback schema and rubric.
- Add session history and concise progress summary.
- Add optional TTS read-aloud only as a manual action.

**Exit criteria:** complete practice session with typed input works even when transcription/LLM providers fail, and unsupported claims are visibly flagged.

### Phase 3 — SQL lab

- Add dialect/schema input and structured SQL generation.
- Add parser/safety gate.
- Add isolated read-only validation with timeout and row cap.
- Add explanation, edge cases, and alternative query UI.

**Exit criteria:** malicious/non-SELECT SQL is rejected; valid sample queries can be validated; no production connection is possible.

### Phase 4 — Live assist beta

- Add preflight consent/policy acknowledgement.
- Add explicit rolling transcription and session controls.
- Add retrieval of only relevant evidence.
- Return short grounded suggestions with confidence and verification labels.
- Add session delete-now control and provider outage fallback.

**Exit criteria:** internal dogfood confirms capture visibility, no hidden recording, acceptable latency, workspace isolation, and no material leakage in logs.

### Phase 5 — Production hardening

- Add provider failover and circuit breakers for LLM/STT.
- Add cleanup worker once storage deletion is supported.
- Add metrics/alerts, abuse controls, cost dashboards, and audit review.
- Run browser matrix and accessibility audit.
- Gradually release by workspace/tenant; keep Live assist opt-in.

## 12. API surface proposal

### Materials

- `materials.create` — upload metadata/content or pasted text.
- `materials.list` — workspace-scoped metadata only.
- `materials.parse` — idempotent extraction job.
- `materials.review` — approve/edit extracted evidence.
- `materials.delete` — revoke access and schedule object deletion.

### Interview

- `interview.createWorkspace`
- `interview.getBrief`
- `interview.generateQuestions`
- `interview.createSession`
- `interview.getSession`
- `interview.deleteSession`

### Practice/live

- `practice.submitAnswer`
- `practice.feedback`
- `live.startSession`
- `live.transcribeSegment`
- `live.suggestAnswer`
- `live.stopSession`

### SQL

- `sql.createCase`
- `sql.generate`
- `sql.validateReadOnly`
- `sql.explainFailure`

All mutations should accept idempotency keys where provider spend or persistence can be duplicated.

## 13. Testing strategy

### Unit tests

- file/MIME/size/page limits;
- text normalization and hashing;
- workspace authorization;
- retention and deletion state transitions;
- evidence grounding and unsupported-claim detection;
- structured response validation;
- SQL parser allowlist and multi-statement rejection;
- quota, cancellation, timeout, and idempotency behavior.

### Route/integration tests

- two users cannot read each other's materials, sessions, suggestions, or SQL cases;
- provider failures retry and fail over without duplicate stored results;
- raw content is absent from logs;
- expired signed URLs are rejected;
- deletion makes records inaccessible;
- malformed model output fails closed with a useful message;
- microphone/transcription failure preserves typed workflows.

### Adversarial tests

- resume/JD contains `ignore previous instructions` payload;
- prompt asks the model to invent a project or metric;
- SQL attempts `DROP`, `UPDATE`, file reads, comments with hidden second statements, or network functions;
- oversized/decompressed files;
- repeated rapid live requests;
- provider returns wrong MIME, malformed JSON, or excessive output;
- browser permission denial and network interruption mid-recording.

### Browser/accessibility tests

- desktop and narrow mobile layouts;
- keyboard-only operation;
- screen reader labels and live regions;
- reduced-motion preference;
- Chromium/Firefox/Safari support matrix for MediaRecorder;
- no microphone prompt before user activation;
- visible active capture state and functional Stop control.

## 14. Observability and operations

Log only structured metadata:

- request/correlation ID;
- workspace/user pseudonymous ID;
- feature/mode;
- provider/model and policy version;
- latency, status, retry count;
- character/token/audio duration counts;
- error category.

Metrics:

- material parse success rate;
- transcription success and latency;
- suggestion grounded/flagged rate;
- practice completion rate;
- SQL validation pass/fail/rejection rate;
- provider error rate and fallback rate;
- quota exhaustion;
- deletion completion;
- p50/p95 latency and cost per session.

Alerts:

- provider error spike;
- latency breach;
- abnormal request volume;
- storage growth/cleanup failure;
- cross-workspace authorization test failure;
- unexpected raw-content logging detection.

## 15. Launch runbook

1. Keep Live assist disabled and launch Prepare/Practice/SQL lab internally.
2. Configure LLM/STT providers and document data-processing regions and retention.
3. Run migrations and verify schema against the live database.
4. Run `pnpm check`, `pnpm test`, `pnpm build`, browser review, and accessibility checks.
5. Test with representative resumes/JDs containing BI, product, engineering, and SQL terminology.
6. Confirm provider outage behavior and typed-only fallback.
7. Confirm two-workspace isolation and deletion behavior.
8. Enable Live assist for a small allowlist with explicit acknowledgement.
9. Review metrics and redacted logs daily during beta.
10. Expand gradually; keep a kill switch that disables capture and live suggestions without affecting the core Bouncy AI app.

## 16. Recommended MVP cut

Ship this first:

- private workspace;
- JD/resume paste and upload;
- editable extracted profile and evidence map;
- question bank;
- typed practice answers and feedback;
- SQL generation with explanation and safe sample validation;
- explicit microphone recording for practice only;
- manual TTS/read-aloud fallback;
- strong deletion, retention, authorization, and redacted logging.

Defer until the MVP is reliable:

- hidden/system-audio capture;
- automatic answer submission;
- browser extension or overlay;
- production database execution;
- multi-party speaker diarization;
- automatic TTS responses during interviews;
- broad public release of Live assist.

## 17. Definition of done

The feature is ready for controlled release when:

- all critical routes are workspace-authorized;
- no provider secret reaches the browser;
- no raw resume/JD/transcript appears in logs or URLs;
- every generated claim is grounded, flagged, or explicitly marked for verification;
- SQL generation never executes against production and rejects unsafe statements;
- recording is explicit, visible, stoppable, and policy-gated;
- typed workflows work through microphone, provider, storage, and network failures;
- retention and deletion behavior is tested and documented;
- TypeScript, unit, integration, adversarial, browser, and accessibility checks pass;
- feature flags and a kill switch are operational;
- the user can understand what was captured, what was sent to providers, and how to delete it.

## Immediate next engineering action

Create a feature branch from the verified `57fb37aa` baseline, extract the reusable Listen/transcription primitives, add the interview domain schema and feature flag, then implement **Phase 1 only**. Do not enable live interview capture while the material-review, consent, retention, and deletion controls are incomplete.
