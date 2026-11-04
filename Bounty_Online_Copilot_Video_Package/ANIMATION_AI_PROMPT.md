# Paste this into your Remotion animation AI

You are producing the hackathon film for **Bounty Online co-pilot** by
BountyAI. Work only from this package. Read `00_MASTER_PRODUCTION_BIBLE.md`
completely first — it overrides any older document, name, or claim.

Build a Remotion project (1920×1080, 30fps) implementing
`storyboard/storyboard-180s.md` scene by scene (S01–S12, 5400 frames),
with narration timings and dialogue exactly as in
`script/narration-and-dialogue.md` and captions conformed from
`script/captions-180s.srt`.

Hard rules:
- Product name is "Bounty Online co-pilot" everywhere. Maker: BountyAI.
- Use only the mascot in `assets/mascot/` — originals untouched, web crops
  for layout. Never generate, redraw, re-costume, or lip-sync the meerkat.
  Poses: M-P09 welcome/close, M-P11 evidence, M-P19 approval, M-S2 present.
- Start from `screenshots/empty-states/` (standalone HTML empty state of every module — rebuild, restyle, animate from empty to populated). Recreate app screens as shells from `screenshots/shell-data.json`
  (verbatim UI text, palette hexes from the bible). Real captures, if
  present in `screenshots/`, replace shells at the same timings. The core
  sequence S04→S06 (question → cue → answer → follow-up) must read as one
  continuous interaction; never fake latency or a model response.
- Claims guardrails: no invented metrics, users, testimonials, or outcomes;
  no "ace any interview / land any job"; no Romanian support; no Meta
  runtime claim — the only credit is "Built with help from Meta's Muse
  Code" plus the exact wording allowed in bible §6. Economic language
  only from `tech/economic-impact.md`.
- Mascot motion: stills with ≤1.5% settle or 200ms fade, never over cue
  text, absent/still during S04–S07 except S07 close. Provide a
  reduced-motion variant (hard cuts).
- Captions: 42px, white on 70% navy, hand-corrected terms; export an .srt
  and a matching transcript .txt.
- Deliver: master 180s MP4, derived 120s and 60s cuts (trims in the
  storyboard), one thumbnail (approved meerkat + one readable question +
  compact cue, text typeset separately: "Your experience. Clearer
  answers."), two social stills (16:9 and 4:5: "Prepare. Speak. Reflect.
  Grow."), and the editable Remotion source.

Before rendering, print a compliance pass against the bible §9 checklist
and list anything you could not source from this package instead of
inventing it.
