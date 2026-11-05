# Bounty Online co-pilot — Master Production Bible

Version 1 · 4 November 2026 · For the Remotion animation AI and any human producer

This is the single source of truth for producing the hackathon film and launch
assets for **Bounty Online co-pilot** by **BountyAI**. It continues and remakes
the founder's master handoff. Where this document and older notes disagree,
this document wins on names, claims, and verified technology.

---

## 0. How to use this package

Read this file first, completely. Then:

1. `assets/` — every visual you may use. Do not generate a new mascot.
2. `screenshots/empty-states/` — standalone HTML empty state of every module (open `index.html`): rebuild, restyle, and animate empty→populated. Then `screenshots/SHOT-LIST.md` + `screenshots/shell-data.json` — the exact
   screens, states, and text to recreate as Remotion shells (or replace with
   real captures from the running app, which is preferred where noted).
3. `storyboard/storyboard-180s.md` — the timed master cut, scene by scene.
4. `script/narration-and-dialogue.md` — every spoken word, verbatim.
5. `script/captions-180s.srt` — caption timing skeleton to conform to the edit.
6. `tech/api-and-models.md` — what actually happens under each scene. Do not
   depict a call, model, or result that is not listed there.
7. `tech/economic-impact.md` — the approved impact language. Do not invent
   numbers beyond it.
8. `ANIMATION_AI_PROMPT.md` — paste-ready instructions for the animation AI.

Deliverable: one 180-second master (pending portal confirmation), one
120-second and one 60-second derived cut, captions, transcript, thumbnail,
and social stills — all from the same scenes, mascot, and claims.

---

## 1. Product truth

**Name:** Bounty Online co-pilot. **Maker:** BountyAI. Never "Bouncy AI",
never "Bounty Life co-pilot", never "Bounty TTS".

**Promise:** Bring your experience into the moment.
**Brand line:** Prepare. Speak. Reflect. Grow.

**What it is:** a personal co-pilot for important professional conversations.
It works from the user's own material — CV, job description, report, script —
and turns it into preparation, grounded in-conversation support, delivery
help, and a useful next step. It never invents experience: missing evidence
is shown as a gap, not filled with fiction.

**The one story the film tells** (the complete learning loop):

> Load a CV and a job description → the system maps what the role needs to
> the candidate's real evidence → a realistic question arrives → a short,
> source-linked cue helps the candidate answer in their own words → a
> follow-up responds to what they actually said → the session ends with
> specific feedback and one practice action.

Presentation delivery and report voiceover bookend that loop to show the
wider "Online co-pilot" scope.

### Three audiences, three offers (keep them distinct)

| Surface | Buyer | Offer in one line | Film time |
|---|---|---|---|
| Listen | People who produce/consume reports (BI, analytics, ops) | "Turn reports into voiceovers people finish." Paste a report, get natural-voice audio, manual by design. | 12–30s bookend + close |
| Interview | Candidates with an interview date | "Walk in ready to pass — with your own evidence." Brief, spoken practice, live grounded support. | Core 30–125s |
| Present | People who present online | "Deliver the talk, don't read it." A teleprompter that scrolls with your voice and bridges you back on course. | 75–95s |

Do not blend the offers. Each scene sells one moment to one buyer.

---

## 2. Judging map (Meta AI Developer Hackathon)

| Criterion | Weight | What the film must prove | Where |
|---|---|---|---|
| Impact | 30% | A specific person, a concrete problem, a useful outcome | Hook (S01), debrief reveal (S08) |
| Use of Meta AI tooling | 25% | Honest, visible Muse Code role; runtime claims only as verified in §6 | Dev-evidence scene (S11) |
| Demo | 25% | One unbroken, understandable question → cue → answer → follow-up | S04–S07 |
| Technical depth | 20% | Grounding with source IDs, turn handling, stale-output protection, failure honesty | Evidence close-up (S05), gap question (S07), tech card (S11) |

Deadline on file: **4 November 2026, 9 PM Eastern**. Confirm the live portal
for video-length and field requirements before locking the master; the
180-second structure is editorial until then.

---

## 3. Brand system

### Mascot (non-negotiable)

The approved meerkat in `assets/mascot/originals/` is the character. Preserve
face, proportions, fur, navy collar with gold tag, and 3D render style.
Never regenerate, re-costume, rename, or lip-sync it. Web crops in
`assets/mascot/web/` are label-free derivatives of the same originals.

| Pose file | Character state | Use |
|---|---|---|
| `M-P09` | Arms raised, celebrating | Welcome, success, closing card |
| `M-P11` | Gold magnifying glass | Evidence, brief, inspection moments |
| `M-P19` | Thumbs up | Approval, feedback, wordmark avatar |
| `M-S2` | Presenting to blank cards | Hero, feature cards, Present scenes |
| `M-R3` | Hands/tail details | Reference only — never a scene asset |

No transparency exists; backgrounds are baked light blue. Compose on light
surfaces, crop, or mask — do not re-render the character to fake alpha.
No listening/thinking pose exists: imply those states with status text and
subtle scale/opacity, plus a reduced-motion alternative.

### Palette (sampled from the approved assets)

| Token | Hex | Source / use |
|---|---|---|
| Mascot navy | `#13203A` | Collar, pose labels, headings |
| Mascot gold | `#F9B600` | Tag, single accent per frame |
| Asset sky | `#DCEBF7` | Mascot image backgrounds |
| Canvas | `#F7F8FA` | Page/film light background |
| Ink text | `#182234` | Primary text on light |
| Muted text | `#566176` | Secondary text |
| Signal emerald | `#10B981` | App live/ready states only |
| Border | `#DCE2EA` | Cards, dividers |

Rules: dark text on gold; one gold element per frame; no purple/indigo
gradients; no glowing text; body copy ≥16px in web shells; film lower-thirds
in navy on canvas with gold rule.

### Voice (copy)

Calm, attentive, encouraging, specific. Short sentences. Say "Add an example
of what changed", never "Improve your performance." Approved microcopy lives
in the storyboard; do not paraphrase product UI text in shells — copy it
from `screenshots/shell-data.json`.

Forbidden claims everywhere (film, captions, thumbnails, social):
"ace every interview", "land any job", "perfect answers", invented metrics
(time saved, accuracy, users, hiring outcomes), testimonials we do not have,
Romanian language support, "runs locally/private" for any path that calls a
cloud provider, Meta endorsement of the product.

---

## 4. What is real (verified in the running app, 4 Nov 2026)

Everything below was exercised against the actual build. Scenes may show
exactly this and no more.

- **Setup:** paste or upload `.md`/`.txt` (client-side read, same materials
  API). PDF is displayed as *Coming soon* — the film must not show a PDF
  upload succeeding. Limits are generous (500k chars); content is stored
  raw and organised by the brief, never silently edited.
- **Brief:** `interview.brief.generate` extracts requirements, evidence with
  stable IDs, gaps, and questions. A human must Approve before Practice or
  Live unlock. Unsupported claims are flagged, never laundered.
- **Practice:** questions are read aloud with the device's most natural
  voice (ranked selection, `shared/speechVoice.ts`); the candidate answers
  by voice, reviews/edits the transcript, gets rubric feedback
  (relevance, structure, evidence, technical correctness, clarity,
  concision), and follow-up questions are read aloud to continue the loop.
- **Live:** dual-stream capture — candidate mic + shared interview tab
  (audio and, now, the tab's video preview). Rolling partial transcription,
  a planner that waits for the pause, classifies new / repeat / echo, and
  token-streams a grounded suggestion (SSE with batch fallback). The stage
  shows interviewer video (left, muted) and "What to say" (right). An
  answers window mirrors the same suggestion for a second screen.
- **Present:** script → cue cards (title, say, transition, seconds) with a
  deterministic local fallback chunker; full-screen prompter with timer.
  **Live Scroll** aligns live transcription to the script word stream
  (LCS alignment over a forward window): follows verbatim and paraphrase,
  holds on silence, jumps on skips, never runs backwards, and offers a
  bridge line when speech matches nothing (off course).
- **Subtitles:** mic → English transcript → Korean captions, pop-out window
  for sharing in Teams/Meet; optional muted camera; nothing stored.
- **Listen:** TTS panel with natural-first cloud voice list
  (Aoede recommended), device read-aloud using ranked natural voices,
  fixed-height composer with internal scroll and a full-size expand editor.
- **Walkthroughs** exist on every surface and auto-open once.
- **Tests:** 139 automated tests green at package time, including alignment,
  grounding, SQL read-only gate, and voice selection suites.

### Explicitly not built (never depict as working)

End-of-session auto-debrief as a single generated artefact (feedback exists
per answer; a packaged summary/improvement plan is a roadmap item), cloud
recording/replay, styled video export, business-context memory actions,
PDF parsing, any Meta *runtime* model (see §6).

In the film, the debrief scene (S08) is composed from real per-answer
feedback, summaries of the session as the user sees them, and the saved
practice action — labelled as the session review it is, not as a fake
one-click report that does not exist.

---

## 5. Remotion production specification

- **Canvas:** 1920×1080, 30 fps, 16:9 safe area 5% on all sides. Derived
  cuts keep the same scenes (see storyboard for trims); social stills 16:9
  and 4:5 from the same compositions.
- **Scene timing:** master is 180s = 5400 frames. Every scene in the
  storyboard lists start frame, duration, and hold points. Never speed up a
  real model interaction and present it as real latency; if a wait is
  trimmed, keep the on-screen "working" state honest (fade, don't jump-cut
  the result in early).
- **Shells:** recreate app screens from `screenshots/shell-data.json` at
  1920×1080 with the palette in §3. Real captures, when supplied, replace
  shells 1:1 at the same timings. UI text is verbatim from the JSON.
- **Mascot motion:** stills with at most a 1.5% scale settle or 200ms fade.
  Never over the cue text, never during the unbroken demo (S04–S07) except
  the closing beat of S07. Reduced-motion variant: hard cuts, no settles.
- **Type in film:** headline 64–84px, body/lower-third 30–36px minimum,
  captions 42px white on 70% navy with names/acronyms hand-corrected.
- **Audio:** founder VO per `script/narration-and-dialogue.md`; interviewer
  and candidate lines recorded clean and close; screen audio under VO at
  −18 dB; no music under the demo core (S04–S08); a single restrained bed
  is allowed under hook and close only.
- **Transitions:** cuts on workflow beats; a 300ms highlight sweep
  question → evidence → cue in S05 is the only animated emphasis. No
  floating logos over the product.

---

## 6. Technology story (verified — film exactly this)

**Safe today:** "Built with help from Meta's Muse Code." Show a real
terminal task, a relevant diff, and a passing check (`pnpm check`, test
suite) with secrets redacted. This is development tooling credit.

**Runtime truth (from `server/_core/providerConfig.ts` and live calls):**

| Layer | What runs today | Film wording allowed |
|---|---|---|
| Reasoning (brief, practice feedback, live cues, cue decks) | OpenAI `gpt-4.1-mini` via OpenAI-compatible API | "the reasoning model" — no vendor claim on screen |
| Transcription (`interview.live.transcribeSegment`, `practice.transcribe`, `voice.transcribe`) | OpenAI `gpt-4o-transcribe` (env-selected; default `whisper-1`) | "live transcription" |
| TTS (Listen cloud) | OpenAI-compatible `/audio/speech`, Aoede-first voice list | "natural-voice audio" |
| Device read-aloud / spoken questions | Browser SpeechSynthesis + ranked natural-voice picker | "reads aloud on your device" |

**Not true today:** any Meta Muse/Llama *runtime* role. If a Meta runtime
integration lands before the shoot, update `tech/api-and-models.md` with the
exact model ID, provider, and a real request trace, and only then use:
"Muse Voice Transcribe handles live transcription; [exact model] creates
evidence-grounded prompts." Never describe the app as Meta-endorsed.

**API calls the film may show** (full contracts in `tech/api-and-models.md`):
`interview.materials.create/list/delete`, `interview.brief.generate/get/
approve`, `interview.practice.questions/submitAnswer/transcribe`,
`interview.present.generate`, `interview.live.transcribeSegment/suggest`,
`POST /api/interview/live/stream` (SSE), `interview.sql.generate/check`,
`tts.create/audioUrl`, `voice.transcribe`. Grounding (`groundSuggestion`)
drops evidence IDs not in the approved brief and caps confidence — this is
the technical-depth beat; show the evidence chip resolving to its source.

---

## 7. Economic impact (approved language)

Full narrative in `tech/economic-impact.md`. Summary, with no invented
numbers:

- **Interviews:** experienced candidates lose roles they can do because
  recall and structure fail under pressure, not competence. Preparation
  anchored to the candidate's own evidence is the lever.
- **Reports:** analytics teams produce insight that goes unread; voiceover
  turns the same artefact into something consumed, without new headcount.
- **Presentations:** presenters read slides because notes tools are static;
  a voice-following prompter returns attention to the audience.
- **Business shape (to test, not claimed):** individual practice plans,
  session bundles, coach/training workspaces. No prices, market sizes, or
  outcome statistics may appear unless sourced in the economic file.

---

## 8. Demo fixture (use exactly this)

Synthetic candidate, labelled on screen "Sample candidate · simulated
interview": BI lead; approved example of a metric-definition disagreement
(product vs finance) with documented decision process; **explicitly missing**
numerical outcome; no Kubernetes migration in the profile.

Questions, in order:

1. "Tell me about yourself for this role."
2. "Describe a time stakeholders disagreed about a metric. How did you reach a decision?"
3. Follow-up: "What changed after that decision, and how did you know it worked?"
4. Gap test: "Tell me about your Kubernetes production migration." → the
   system flags missing evidence instead of inventing a project.
5. Continuity: "Explain your previous answer to a nontechnical executive."

The unbroken take is Q2 → cue → answer → Q3 follow-up. Keep one uncut
recording as technical evidence alongside the edit.

---

## 9. Acceptance checklist (producer signs off each)

- [ ] Product named **Bounty Online co-pilot** (BountyAI) in every title,
      caption, lower-third, filename, and credit.
- [ ] Mascot is the approved asset, unmodified, poses per §3, absent or
      still during the demo core.
- [ ] One continuous question → cue → answer → follow-up segment exists
      uncut; edits never fake latency or a model response.
- [ ] Every depicted feature is in §4 "real" list; roadmap items appear
      only as labelled direction, never as working UI.
- [ ] Model credit matches §6 verification at shoot time; no Meta runtime
      claim without an exact ID + trace in `tech/api-and-models.md`.
- [ ] No forbidden claims (§3) anywhere, including thumbnails and social.
- [ ] Economic language matches `tech/economic-impact.md`; zero invented
      metrics, users, or testimonials.
- [ ] Captions complete and hand-corrected; transcript file matches audio.
- [ ] Shells use verbatim UI text from `screenshots/shell-data.json`, or
      real captures replace them at identical timings.
- [ ] Mobile/derived cuts readable; CTA destination is a real route or the
      demo URL confirmed by the founder.
- [ ] This package regenerates: another producer can rebuild every export
      from these files alone (see README).

## 10. Open items only the founder can close

1. Portal video-length limit and required submission fields (locks 180s).
2. Track (indie/startup) and team members to name in credits.
3. Destination URL for the closing CTA, and whether the demo link may be
   public during judging.
4. Whether a Meta runtime swap (Muse Voice Transcribe or Muse Spark)
   lands before the shoot — if yes, §6 and S11 are re-verified, not assumed.
5. Founder on-camera availability for hook/close lines in the script.
