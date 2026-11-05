# Bounty Online co-pilot — Video Production Package

Everything an animation AI (Remotion) or human producer needs to make the
hackathon film. Start with `00_MASTER_PRODUCTION_BIBLE.md`.

| Path | Contents |
|---|---|
| `00_MASTER_PRODUCTION_BIBLE.md` | Product truth, brand, verified features, Remotion spec, claims rules, acceptance checklist |
| `storyboard/storyboard-180s.md` | Timed scenes S01–S12 (5400 frames) + derived-cut trims |
| `script/narration-and-dialogue.md` | Every spoken line, verbatim |
| `script/captions-180s.srt` | Caption timing skeleton |
| `screenshots/SHOT-LIST.md` | Captures to take from the running app, in order |
| `screenshots/shell-data.json` | Verbatim UI text + palette for Remotion shells |
| `screenshots/empty-states/` | Standalone HTML empty state of every module — rebuild, restyle, animate (open `index.html`) |
| `assets/mascot/originals/` | Approved meerkat PNGs — untouched |
| `assets/mascot/web/` | Label-free JPEG crops used by the web app |
| `assets/asset-manifest.md` | Pose → placement map and character lock |
| `tech/api-and-models.md` | Verified models + every API call the film touches |
| `tech/economic-impact.md` | Approved impact language (no invented numbers) |
| `ANIMATION_AI_PROMPT.md` | Paste-ready brief for the Remotion AI |

Run the app for captures: `pnpm build && PORT=3123 NODE_ENV=production
node dist/index.js` → http://localhost:3123 (landing), /interview,
/interview/present, /brand (visual review board).
