# Shot list — screens to capture or recreate as shells

Preferred: real captures from the running app (`pnpm build && PORT=3123
NODE_ENV=production node dist/index.js`, Chrome, 1920×1080, browser zoom
100%, light theme). Where a capture is impractical, recreate the shell in
Remotion from `shell-data.json` — text verbatim, palette from the bible,
and label the sequence as the app shell it is. Never pass a shell off as a
live model response inside the uncut demo core (S04–S06 must be real).

Load demo materials from Setup ("Load demo materials") or the API fixture
in the bible §8, approve the brief, then capture in this order:

| # | File name | Route | State to capture | Scene |
|---|---|---|---|---|
| 1 | `01-setup-demo-loaded.png` | `/interview` (Setup) | Both demo materials listed, steps 1–2 ticked | S02 |
| 2 | `02-brief-evidence-gap.png` | `/interview` (Brief) | Requirements→evidence visible, one Gap badge, Approve button | S03 |
| 3 | `03-practice-voice.png` | `/interview` (Practice) | Question selected, Hear/Answer-by-voice controls, one feedback with scores + follow-ups | S03b |
| 4 | `04-live-stage-cue.png` | `/interview` (Live) | Shared tab video left, "What to say" cue + evidence right, Listening pill | S04–S06 |
| 5 | `05-live-gap-bridge.png` | `/interview` (Live) | Kubernetes question → "Not in your evidence" + bridge | S07 |
| 6 | `06-present-livescroll.png` | `/interview/present` (Live scroll) | Current sentence highlighted, bridge/next banner, Following state | S09 |
| 7 | `07-listen-natural.png` | `/` (Listen) | Report sample, Aoede voice, device-voice note, generated audio player | S10 |
| 8 | `08-brand-products.png` | `/` (Products) | Three ICP cards with mascots | S10/S12 b-roll |
| 9 | `09-terminal-checks.png` | Terminal | `pnpm check` + test summary green, secrets redacted | S11 |
| 10 | `10-brand-board.png` | `/brand` | Mascot poses + palette + have/change lists | Reference only |

For S04 the interviewer picture is a simulated meeting tab — label it
on screen. Record one uncut take of Q2 → cue → answer → follow-up at
native speed and keep it beside the edit as evidence.
