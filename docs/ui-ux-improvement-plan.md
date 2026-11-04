# UI/UX Improvement Plan — hackathon polish pass

Goal: make Bouncy AI look like a funded product in a 3-minute judge demo —
lightweight (no new dependencies, no webfonts), beautiful (one coherent
visual system), functional (every control reachable, readable, and fast).

## Diagnosis (from reading the current UI)

- Stock shadcn blue primary + indigo accents everywhere (15 hardcoded
  `indigo-*` uses) — reads as template, not brand.
- No shared shell: Home, Interview, Answers, Present, Subtitles each invent
  their own header, background, and button colors.
- Cards repeat `border-slate-200 bg-white`; no elevation or radius system.
- Dark stages (Answers/Present/Subtitles) are close but inconsistent in
  type scale, progress, and control placement.
- Small touch targets, tabs that can overflow on mobile, no `kbd` hints,
  no reduced-motion handling, no tabular numbers for timers.

## Design system (P0 — `client/src/index.css`)

- Ink primary: near-black buttons/links; one signal color (emerald) for
  live/ready/progress; amber = verify, red = recording. No gradients.
- Radius scale tightened; focus ring in signal color; selection color;
  thin scrollbars; `font-feature-settings` for tabular numbers on timers.
- `prefers-reduced-motion` respected globally.
- Utilities: `.stage` (dark prompter surface), `.cue-in` (cue transition).

## Micro-components (P1 — `client/src/components/brand.tsx`)

One small file, reused everywhere: `Wordmark`, `TopBar`, `LiveDot`,
`ProgressTrack`, `Kbd`, `EmptyStage`. No new deps; lucide icons only.

## Surfaces (P2–P3)

- Home: wordmark nav, ink CTA, Listen card as the hero product surface.
- Interview: sticky top bar with wordmark + live status, scrollable tab
  rail, unified cards, Present cue list with active-cue ink state.
- Stages: Present/Answers/Subtitles share the dark stage, progress track,
  big-type hierarchy, keyboard hints, 40px+ touch targets.

## Non-goals

No new libraries, fonts, animation frameworks, or backend changes.
No layout rewrite of working flows — only tokens, shared pieces, class polish.

## Usability audit — simulated first-time journeys

Walked as a new user would, in order. Each gap found was fixed in the same pass:

| Journey | Gap found | Fix |
|---|---|---|
| Home → presentation | Present buried inside Interview; no front door | "Present a talk" CTA + `/interview?tab=present` deep link |
| Setup → Brief | Generating a brief left the user on Setup | Auto-switches to Brief to review |
| Brief → Practice | Approval gave no next step | "Start practicing" CTA + unlock explainer |
| Present → prompter | No confirmation after generating | "Cue cards ready" banner with exact next actions |
| Prompter restart | Restart kept the clock running | Restart now zeroes and stops the timer (unit-tested) |
| Prompter first open | Tour ambushed an empty stage | Tour is Help-only there; auto-open kept for Interview/Subtitles first visits |
| Answers window | No explanation for a first-time viewer | "How it works" walkthrough in the header |

Walkthroughs: one dependency-free tour component (`Walkthrough.tsx`),
auto-opens once per surface (localStorage seen-flag), replayable from
Help/Walkthrough buttons, tab-aware on Interview, keyboard navigable.

## Validation

`pnpm check`, `pnpm test`, `pnpm build`, then live HTTP checks of `/`,
`/interview`, `/interview/present`, `/interview/answers`,
`/interview/subtitles`, plus a real cue-generation call.
