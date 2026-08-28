# Bouncy AI TTS

A standalone Node.js, Express, React, Drizzle, and tRPC text-to-speech module for embedding an accessible, manual-only **Listen** panel into Bouncy AI insights, reports, and user-entered text.

## Included

The module provides authenticated workspace-scoped jobs, relational records for workspaces, memberships, jobs, voice settings, quotas, audio artifacts, statuses, expiry, and structured errors. It includes a provider-agnostic server adapter with primary/secondary HTTP providers, bounded transient retries, failover, idempotency, cancellation, private managed storage, signed playback URLs, browser SpeechSynthesis fallback, and an accessible responsive UI.

## Local setup

The project uses the managed environment variables already provided by the full-stack scaffold. Optional server-only provider variables are:

```bash
TTS_PRIMARY_BASE_URL=https://your-provider.example/v1
TTS_PRIMARY_API_KEY=server-only-secret
TTS_PRIMARY_MODEL=tts-1
TTS_SECONDARY_BASE_URL=https://backup-provider.example/v1
TTS_SECONDARY_API_KEY=server-only-secret
TTS_SECONDARY_MODEL=tts-1
TTS_MAX_CHARS=5000
TTS_RETENTION_HOURS=24
```

Provider credentials must be added through the project’s secret manager. Never expose them as `VITE_*` values, commit `.env` files, or call providers directly from the browser. The server adapter expects an OpenAI-compatible `POST /audio/speech` endpoint returning an MP3 response. A future adapter can implement the same `TtsProvider` interface for another provider.

Run the project with:

```bash
pnpm dev
pnpm check
pnpm test
pnpm build
```

## Embedding the Listen panel

The standalone UI currently lives at `client/src/pages/Home.tsx`. To embed it in the Bouncy AI application, extract the panel portion into a reusable component and pass a source contract like this:

```ts
type ListenSource = {
  sourceType: "insight" | "report" | "user_text";
  sourceId?: string;
  text: string;
  workspaceId: string;
};
```

The parent Bouncy AI surface supplies the selected insight or report text. The panel calls the typed procedures under `trpc.tts`, preserves the source metadata, and keeps the text in the parent workflow. Generation remains manual only; there is no autoplay.

## tRPC procedures

| Procedure | Auth | Purpose |
|---|---|---|
| `tts.config` | Public | Returns enabled languages, voices, speeds, and limits |
| `tts.quota` | Protected | Returns current workspace usage and limits |
| `tts.recent` | Protected | Returns recent workspace jobs |
| `tts.create` | Protected | Validates, idempotently creates, synthesizes, stores, and completes a job |
| `tts.get` | Protected | Returns a workspace-scoped job and artifact metadata |
| `tts.audioUrl` | Protected | Returns an authorized signed playback URL for a ready artifact |
| `tts.cancel` | Protected | Aborts an in-flight job when supported |

A create request contains `workspaceId`, `text`, `languageCode`, `voiceId`, `speed`, `sourceType`, optional `sourceId`, and an `idempotencyKey`. The default `workspaceId: "user"` maps to the authenticated user’s personal workspace. For Bouncy AI, replace it with a real workspace identifier and provision a corresponding membership record.

## Data and privacy behavior

Raw text is normalized before provider submission. Jobs store a SHA-256 text hash and character count by default rather than raw text. Audio is stored privately using generated workspace/job keys, referenced by metadata, and served through short-lived signed access. Expiry metadata is stored on jobs and artifacts; a scheduled cleanup worker should delete expired objects according to the hosting environment’s supported background-job mechanism. The current managed storage helper does not expose object deletion, so the production cleanup implementation should be added when the storage deletion capability is available.

## Launch runbook

Before launch, configure a primary provider and validate its commercial terms, language quality, retention behavior, and regional processing. Configure a secondary provider or deliberately enable the device fallback-only mode. Verify quota and concurrency limits, test workspace isolation with two users, check signed URL expiry, and review logs for raw-text leakage. Enable the feature behind a flag, dogfood with representative BI terms, monitor latency, completion rate, provider errors, and character usage, then expand gradually.

The feature is designed to fail safely: invalid input is rejected before provider spend, transient provider errors retry and fail over, duplicate idempotency keys return the existing job, authorization is workspace-scoped, and the underlying Bouncy AI insight remains usable as text if audio is unavailable.

## GitHub

Recommended repository: `Kavii101/bouncy-ai-tts` (private). Create and push with:

```bash
gh repo create Kavii101/bouncy-ai-tts --private --source=. --remote=origin --push
```

## Status

The implementation is ready for provider credentials and Bouncy AI’s real workspace membership model. The browser fallback works without a cloud provider; cloud generation requires a configured server-side compatible provider.
