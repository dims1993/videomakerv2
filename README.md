# VideoMaker v2

Local production workspace for planning, producing, and packaging YouTube videos with an LLM-assisted editorial pipeline.

This is not a one-click auto-generator. It keeps every video in a clear production state — idea, script, visual plan, image assets, voiceover, subtitles, draft render, thumbnail, and publish metadata — so a small team (or a single creator) can move from raw topic to export-ready package without losing context between tools.

## Why it exists

AI makes it easy to generate text, images, and audio. The hard part is keeping those pieces aligned as a single video progresses.

VideoMaker v2 solves that with:

- a **multi-channel editorial model** (tone, prompts, and rules per YouTube channel)
- a **stage-based production UI** with computed status
- **copy-ready prompts** for external LLMs (ChatGPT and similar)
- **local asset storage** plus optional integrations (ElevenLabs, Google Flow)
- **FFmpeg draft renders** and a full **JSON export package** for handoff

## Production pipeline

```text
Idea → Script → Visual Plan → Assets → Voiceover & Subtitles → Render Draft → Thumbnail → Metadata
```

Status is derived from real data (not just a manual dropdown): missing idea JSON, missing script, incomplete scene prompts, or missing metadata each map to the next unfinished stage.

## Tech stack

| Area | Choice |
| --- | --- |
| App | Next.js 15 (App Router), React 19, TypeScript |
| UI | Tailwind CSS, Radix primitives, shadcn-style components |
| Data | Prisma + SQLite (local-first) |
| Media | FFmpeg (draft render), local filesystem under `storage/` |
| Integrations | ElevenLabs (voiceover), Google Flow via Playwright (image batches) |
| Validation | Zod |

## Architecture (short)

- **Server Actions + API routes** drive mutations and file serving.
- **Prisma models** hold structured production state (`Video`, `Scene`, `TopicIdea`, batches, segments, render drafts, process runs).
- **Heavy files** (images, audio, renders, thumbnails) live on disk under `storage/` and are gitignored.
- **Channel profiles** in `src/lib/channels.ts` point to prompt templates and (locally) editorial bibles.
- **Prompt assembly** in `src/lib/video-prompts.ts` builds stage prompts from channel profile + current video state — ready to paste into an external LLM.

```text
src/
├── app/                 # routes, server actions, API
├── components/          # production UI + shared UI kit
└── lib/                 # channels, prompts, render, voiceover, exports
prompts/channels/        # per-channel stage prompts (tracked)
prisma/                  # schema + migrations
storage/                 # local media (ignored)
docs/                    # local editorial bibles (ignored; keep private)
```

## Channels

Configured channels:

- **Wealth Insights** — personal finance / money education (topic queue, categories, stronger editorial constraints)
- **Christian Life** — reflective faith storytelling
- **The God’s Word** — illustrated Bible-study style workflow

Stage prompts live in `prompts/channels/<channel>/` (`angle-builder`, `script-writer`, `visual-planner`, `metadata-writer`).

Editorial bibles under `docs/` are intentionally **not** in the remote repository (see `.gitignore`). Keep them locally if you use channel-specific style rules.

## Key features

- Dashboard of videos with computed production status
- Create flow with channel, topic, title, and structured `ideaJson`
- Wealth Insights daily topic queue (import ideas → spawn videos)
- Scene import / patch / split / merge tools for visual plans
- Image batch preparation, Google Flow automation, and local import matching
- Scene- or segment-based ElevenLabs voiceover, pacing, and subtitle alignment
- Local FFmpeg draft render with diagnostics and preview
- Thumbnail brief → concepts → final image workflow
- One-click **Export Video Package** (full JSON snapshot for another process or LLM)

## Getting started

### Requirements

- Node.js 20+ recommended
- npm
- FFmpeg on `PATH` (or set `FFMPEG_PATH`) for draft renders
- Optional: ElevenLabs API key, Google Flow + Chromium/CDP for image automation

### Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run db:seed   # optional sample video
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Useful scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Local Next.js server |
| `npm run build` / `npm start` | Production build |
| `npm run lint` | ESLint |
| `npm run prisma:studio` | Inspect SQLite data |
| `npm run db:seed` | Seed an empty database |

### Environment

See `.env.example`. Minimum for local use:

```env
DATABASE_URL="file:./dev.db"
```

Optional integrations:

- `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID`, `ELEVENLABS_DEFAULT_MODEL_ID`
- `GOOGLE_FLOW_*` and `FFMPEG_PATH` for automation / burn-in captions

The app also works in a **manual mode**: copy prompts out, generate elsewhere, import results back.

## Data model (core)

- **Video** — channel, topic, idea JSON, script, metadata, voiceover/subtitle/render/thumbnail fields
- **Scene** — ordered narrative unit (`avatar` / `insert` / `space`) with image + optional per-scene voiceover
- **TopicIdea** — editorial queue items (Wealth Insights)
- **ImageBatch**, **VoiceoverSegment**, **SubtitleSegment**, **RenderDraft**, **ProcessRun** — supporting production entities

Schema: `prisma/schema.prisma`.

## Local media layout

```text
storage/
├── batches/
├── generated-images/
├── renders/
├── thumbnails/
└── voiceovers/
```

All of `storage/` is gitignored.

## Design notes

- Prefer **repeatable handoffs** (structured JSON / clean narration) over opaque automation.
- Channel rules stay declarative so new channels are mostly config + prompt files.
- Long-running work is tracked via `ProcessRun` so the UI can show progress without blocking the page model.

## Development tip

Do not run `npm run build` while `npm run dev` is writing to `.next`. If the cache gets into a bad state:

```bash
rm -rf .next
npm run dev
```

---

Built as a practical local-first production system for multi-channel YouTube workflows — structured state, LLM-friendly prompts, and media packaging in one place.
