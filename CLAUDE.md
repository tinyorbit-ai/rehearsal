# Interview Prep — "The Rehearsal"

Webcam-based interview rehearsal tool. Record yourself answering questions,
get live captions + delivery stats while you talk, and a structured LLM
critique after.

## Status

**End-to-end functional.** Camera + mic recording, on-device live captions
via transformers.js Whisper-tiny, 30-second rolling stats, post-stop cloud
transcription via Groq, LLM analysis via Vercel AI Gateway. Single-page
app, three states (setup → recording → analysis), client-only file
storage.

## Architecture

```
┌─ Browser (client-only recording) ─────────────────────────────┐
│  getUserMedia ─┬─ MediaRecorder(video+audio) ─→ Blob ─→ DL    │
│                ├─ MediaRecorder(audio only) ──→ Blob ─→ DL    │
│                └─ AudioWorklet (16kHz PCM + RMS) ─┐           │
│                                                   ▼           │
│  Web Worker: transformers.js Whisper-tiny.en (WebGPU/WASM)    │
│                       │                                       │
│                       ▼                                       │
│  Live captions + LocalWindow[] + RMS samples                  │
│                       │                                       │
│  Stats engine (30s tick): WPM, filler %, pauses, volatility   │
│                                                               │
│  STOP → POST audio Blob → /api/transcribe ─→ Groq Whisper-v3  │
│       → POST transcript+context → /api/analyze ─→ AI Gateway  │
└───────────────────────────────────────────────────────────────┘
```

Files (video + audio) never leave the browser. Only the audio blob is
sent to Groq for the post-stop accurate transcript, and the text
transcript + optional context (goal/JD/CV/prep doc) is sent to the LLM.

## Stack

- **Next.js 16.2.6** App Router · React 19.2 · Turbopack
- **React Compiler** enabled (`reactCompiler: true` in `next.config.ts`).
  Auto-memoizes components and hooks — DO NOT add `useCallback` /
  `useMemo` manually unless profiling shows the compiler missed it.
  Dev compile time is higher because the compiler is Babel-based.
- **Tailwind v4** with `@theme` design tokens
- **Geist Sans** (everything) + **JetBrains Mono** (numbers, kicker labels)
  via `next/font/google`. Single-family by design.
- **`@huggingface/transformers` v4** — Whisper-tiny.en in a Web Worker
- **`ai` v6** + **`@ai-sdk/gateway`** — final LLM analysis (model
  selectable via env string)
- **`zod`** — schema for structured LLM output
- **`pdf-parse` v2** — CV / prep doc PDF parsing in `/api/parse-file`

## Env vars

Copy `.env.example` to `.env.local` and fill in:

```bash
AI_GATEWAY_API_KEY=...        # Vercel AI Gateway
ANALYSIS_MODEL=openai/gpt-5.5 # change string to swap model
GROQ_API_KEY=...              # cloud transcription
```

The model string format is `provider/model`. Pulling from AI Gateway
means you only change one env var to swap models. Examples:
`anthropic/claude-sonnet-4.6`, `xai/grok-4.1`, `openai/gpt-5.5`.

## Routes

| Route | Purpose |
|---|---|
| `app/page.tsx` | Single-page state machine: setup → recording → analysis |
| `app/api/transcribe/route.ts` | POST audio file → Groq Whisper-large-v3-turbo → segments with timestamps + avg_logprob |
| `app/api/analyze/route.ts` | POST `{transcript, segments, durationSec, goal?, jd?, cvText?, prepText?, stats?, model?}` → Vercel AI Gateway with Zod-validated structured output |
| `app/api/parse-file/route.ts` | POST file (pdf/md/txt) → `{ text }` |

## Components

```
components/
  Masthead.tsx      — editorial header + section indicator
  Setup.tsx         — video preview + idle vitals + Preparation drawer
  Recording.tsx     — live frame + live vitals + delivery tips
  Analysis.tsx      — loading/error states + final feedback layout
  VideoFrame.tsx    — shared 16:9 frame, REC chrome, captions overlay
  Vitals.tsx        — stats sidebar, idle/live, action button
  Preparation.tsx   — goal / JD / CV / prep doc form (with file upload)
```

```
lib/
  recorder.ts        — useRecorder hook, dual MediaRecorder, 30-min cap
  transcription.ts   — useTranscription hook, AudioWorklet + Worker
  whisper.worker.ts  — transformers.js Whisper-tiny in Web Worker
  stats.ts           — WPM/fillers/pauses/volatility, useStats hook
  feedback-schema.ts — Zod schema for /api/analyze structured output
public/
  audio-worklet.js   — PCM collector, runs in audio thread
```

## Design tokens

Defined in `app/globals.css` `@theme`. Use these — no ad-hoc colors.

| Token | Value | Use |
|---|---|---|
| `--color-ink-0` | `#0f0d0b` | page background |
| `--color-ink-1` | `#1a1714` | surfaces |
| `--color-ink-2` | `#2f2a24` | hairlines |
| `--color-paper` | `#fbfaf7` | primary text |
| `--color-paper-2` | `#b5ad9f` | secondary text |
| `--color-paper-3` | `#6e675c` | tertiary / kicker |
| `--color-hazard` | `#ff6028` | recording / primary CTA |
| `--color-brass` | `#e5c870` | positive / accent |
| `--color-oxblood` | `#e0392c` | warning / stop |

`.kicker` utility = small uppercase label (mono, 10px, paper-3).
`.tnum` = tabular figures for stats. No gradients, no italics.

## Dev commands

```bash
pnpm dev               # Matt runs this — start dev server (Turbopack)
pnpm next build        # production build sanity check
pnpm tsc --noEmit      # type check
pnpm lint              # eslint
```

## How the live caption pipeline works

1. `getUserMedia` returns a MediaStream with video + audio tracks
2. The audio track is fed into an `AudioContext({ sampleRate: 16000 })`
   which is connected to an AudioWorklet (`/public/audio-worklet.js`)
3. The worklet emits ~250ms PCM chunks + RMS values to the main thread
4. `useTranscription` maintains a 6-second rolling buffer at 16kHz
5. Every 2 seconds, the most recent 4-second window is sent to a Web
   Worker running transformers.js Whisper-tiny.en
6. The worker returns the text; the main thread updates `caption` state
   and appends a `LocalWindow` for the stats engine
7. `useStats` computes WPM (avg words-per-second × 60 across recent
   windows), filler ratio (regex), long pauses (RMS-silence runs > 2s),
   volatility (stdev of WPS) every 30 seconds and emits a `StatsSnapshot`

## How the post-stop pipeline works

1. User presses Stop. MediaRecorder fires `onstop`, the recorder hook
   produces a `Blob` for video and a separate one for audio
2. The page transitions to the Analysis view immediately. Download
   chips work right away (object URLs). The pipeline shows a 2-step
   loading indicator.
3. The audio blob is POSTed to `/api/transcribe`, which forwards to
   Groq Whisper-large-v3-turbo with `verbose_json`. Returns timestamped
   segments with `avg_logprob`.
4. The transcript + optional context + final stats snapshot are POSTed
   to `/api/analyze`. The route uses `generateObject` from the AI SDK
   with the Zod `feedbackSchema` and the model string from env.
5. The Analysis screen renders feedback when the call completes.

## Gotchas (real ones, hit during build)

- **Cactus has no browser SDK and no documented Cloud HTTP transcription
  API.** Picked Groq Whisper-large-v3-turbo as the cloud tier.
  The `/api/transcribe` boundary is identical, swap providers freely.
- **Tailwind v4 syntax** — `@theme` block in `globals.css`, no
  `tailwind.config.ts` needed.
- **next/font subsetting** — Fraunces was tried and dropped (too
  editorial). Geist + JetBrains Mono only.
- **pdf-parse v2 API** — uses `new PDFParse({ data })` + `getText()`,
  not the old default-export function.
- **React 19 strict purity** — Date.now() can't be called during render,
  refs can't be mutated during render. State snapshots at event time
  (e.g. handleStop) are simpler than effect-based mirroring.
- **AudioWorklet must be a separate JS file** in `/public`, not bundled.
- **Vercel serverless 4.5MB body limit** — 30-min audio at opus ~32kbps
  is ~7MB. For prod on Vercel, audio uploads to /api/transcribe will
  need to migrate to Vercel Blob or a presigned upload. Local dev fine.
- **WebGPU** — Chrome/Edge first-class. Whisper falls back to WASM
  automatically. Safari runs WASM at slower-than-realtime; usable but
  visibly behind.

## Conventions

- Recording state and blobs live in the browser. Server routes only for
  cloud transcription, LLM, and PDF parsing.
- Components are presentational; orchestration lives in `app/page.tsx`.
- Stats fire on a 30-second cadence with an 8-second warmup.
- Filler word list is in `lib/stats.ts` — extend there.

### React patterns we follow

- **Interaction logic in event handlers, not effects.** The post-stop
  pipeline (transcribe → analyze) lives in `handleStop`, not an
  `audioBlob`-driven `useEffect`. `recorder.stop()` returns a Promise
  that resolves on `MediaRecorder.onstop` so the handler can await
  blobs directly.
- **Refs for transient values.** PCM rolling buffer, chunk arrays,
  recorder instances — anything updated frequently that doesn't drive
  UI is a `useRef`, not state.
- **No manual `useCallback` / `useMemo`.** React Compiler handles
  memoization. Plain functions inside hooks and components.
- **Effects only for external-system sync.** Worker boot/teardown,
  beforeunload listener, intervals, AudioContext lifecycle. Each
  effect maps to a real resource it owns.
