# API and model map — verified 4 Nov 2026

Source of truth: `server/_core/providerConfig.ts`, `server/routers/interview.ts`,
`server/routers.ts`, `server/_core/index.ts` (SSE), and live calls against
the production build. Secrets never appear here or on screen.

## Models (runtime, today)

| Role | Model | Selected by | Notes |
|---|---|---|---|
| Reasoning | `gpt-4.1-mini` (OpenAI default on api.openai.com) | `LLM_MODEL` env override | Structured outputs in OpenAI strict mode; Zod re-validated server-side |
| Transcription | `gpt-4o-transcribe` in the local `.env`; code default `whisper-1` | `TRANSCRIPTION_MODEL` | Bytes POSTed directly to `/v1/audio/transcriptions`; no storage hop |
| TTS | provider `TTS_PRIMARY_MODEL` (OpenAI-compatible `/audio/speech`) | env | Voices: Aoede (default, natural/warm), Achird, Charon, Kore |
| Device speech | Browser SpeechSynthesis + `shared/speechVoice.ts` ranker | client | Prefers Natural/Neural/Google/Microsoft-natural voices |

**Meta:** Muse Code is development tooling (founder-reported; film a real
task + diff + green check). No Meta runtime model is wired today. Any swap
must record: exact model ID, provider, env var, one redacted request trace,
and the scene wording it unlocks (bible §6).

## Procedures the film touches

Base path `/api/trpc` (tRPC + SuperJSON). Live streaming is
`POST /api/interview/live/stream` (SSE: delta frames, then a grounded final).

| Procedure | Auth | Input (key fields) | Output | Scene |
|---|---|---|---|---|
| `interview.config` | public | — | flags, dialects | all (gating) |
| `interview.materials.create/list/delete` | public (solo workspace) | kind, text ≤500k | metadata only on list | S02 |
| `interview.brief.generate/get/approve` | public | workspaceId | strict-schema brief; approval gate | S03 |
| `interview.practice.questions` | public | approved brief only | questions | S03b |
| `interview.practice.transcribe` | public | audioBase64 ≤16MB, mime | transcript text | S03b |
| `interview.practice.submitAnswer` | public | question, category, answer | rubric feedback + follow-ups; answer stored as hash | S03b/S08 |
| `interview.live.transcribeSegment` | live flag | source, chunk, partial flag | text + detected language | S04–S06 |
| `interview.live.suggest` + SSE stream | live flag | question, recent turns | grounded suggestion (evidence IDs filtered, confidence capped) | S05–S07 |
| `interview.present.generate` | copilot flag | title, script ≤60k, targetMinutes | cue deck or local-chunker fallback (`source` field) | S09 |
| `interview.sql.generate/check` | public | prompt/dialect or raw SQL | solution + read-only classification | (not filmed in master) |
| `tts.create`, `tts.audioUrl` | protected | text, voice, speed | job + signed URL | S10 (cloud path) |
| `voice.transcribe` | protected | audioBase64 | transcript | Listen mic input |

Grounding invariant (film this): `groundSuggestion` drops any evidence ID
not in the approved brief, surfaces it as an unsupported claim, and forces
confidence down. The planner (`shared/interview/liveSession.ts`) answers
completed turns only, refines repeats, skips echoes. Scroll alignment
(`shared/interview/scrollFollow.ts`) is forward-only LCS matching.

Error honesty: malformed model output fails closed
(`MODEL_OUTPUT_MALFORMED`); DB outage maps to "Storage is temporarily
unavailable", never a fake transcription error.
