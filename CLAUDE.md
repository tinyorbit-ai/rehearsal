# The Rehearsal

Webcam-based delivery rehearsal tool. Record yourself rehearsing — a
conference talk, presentation, sales pitch, job interview, or anything
else — and get live captions + delivery stats while you talk, plus a
structured LLM critique after. The Preparation step asks "What are you
rehearsing for?" via a `kind` dropdown (`presentation | pitch | interview
| other`) and accepts a freeform brief plus one supporting-material
upload (slides outline, JD, CV, prep notes — anything).

## Status

**End-to-end functional.** Camera + mic recording, on-device live captions
via transformers.js Whisper-tiny, 30-second rolling stats, post-stop cloud
transcription via Groq, LLM analysis via Vercel AI Gateway. Single-page
app, three states (setup → recording → analysis), client-only file
storage.

## Architecture

```
┌─ Browser (transcription is 100% on-device) ───────────────────┐
│  getUserMedia ─┬─ MediaRecorder(video+audio) ─→ Blob ─→ DL    │
│                ├─ MediaRecorder(audio only) ──→ Blob ─→ DL    │
│                └─ AudioWorklet (16kHz PCM + RMS) ─┐           │
│                                                   ▼           │
│  Web Worker: transformers.js                                  │
│    distil-whisper/distil-medium.en (WebGPU → WASM fallback)   │
│                       │                                       │
│  Live captions + LocalWindow[] + RMS samples                  │
│  Stats engine (10s tick): WPM, filler %, pauses, volatility   │
│                                                               │
│  STOP → decodeAudioData → OfflineAudioContext(16kHz mono)     │
│       → worker.transcribeFull → timestamped segments          │
│       → POST transcript+context → /api/analyze ─→ AI Gateway  │
└───────────────────────────────────────────────────────────────┘
```

Audio + video never leave the browser. The ONLY network call is
`/api/analyze` (Vercel AI Gateway, sends transcript text + optional
context). Transcription runs entirely on-device via WebGPU.

## Stack

- **Next.js 16.2.6** App Router · React 19.2 · Turbopack
- **React Compiler** enabled (`reactCompiler: true` in `next.config.ts`).
  Auto-memoizes components and hooks — DO NOT add `useCallback` /
  `useMemo` manually unless profiling shows the compiler missed it.
  Dev compile time is higher because the compiler is Babel-based.
- **Tailwind v4** with `@theme` design tokens
- **Geist Sans** (everything) + **JetBrains Mono** (numbers, kicker labels)
  via `next/font/google`. Single-family by design.
- **`@huggingface/transformers` v4** — `onnx-community/distil-medium.en`
  in a Web Worker. Used for BOTH live captions (4s sliding windows) and
  the timestamped final transcript on Stop. ~400MB first-load, cached.
- **`ai` v6** + **`@ai-sdk/gateway`** — final LLM analysis (model
  selectable via env string)
- **`zod`** — schema for structured LLM output
- **`pdf-parse` v2** — CV / prep doc PDF parsing in `/api/parse-file`

## Env vars

Copy `.env.example` to `.env.local` and fill in:

```bash
AI_GATEWAY_API_KEY=...        # Vercel AI Gateway — the only network call
ANALYSIS_MODEL=openai/gpt-5.5 # change string to swap model
```

The model string format is `provider/model`. Pulling from AI Gateway
means you only change one env var to swap models. Examples:
`anthropic/claude-sonnet-4.6`, `xai/grok-4.1`, `openai/gpt-5.5`.

## Routes

| Route | Purpose |
|---|---|
| `app/page.tsx` | Single-page state machine: setup → recording → analysis |
| `app/api/analyze/route.ts` | POST `{transcript, segments, durationSec, kind?, goal?, brief?, materialText?, stats?, model?}` → Vercel AI Gateway with Zod-validated structured output. `kind` tunes the coach preamble; STAR arc only set for `interview` |
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
  Preparation.tsx   — "What are you rehearsing for?" — kind dropdown, title, brief textarea, single supporting-material file upload
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
pnpm dev               # start dev server (Turbopack)
pnpm next build        # production build sanity check
pnpm tsc --noEmit      # type check
pnpm lint              # eslint
pnpm test:run          # unit + integration tests (Vitest)
pnpm test:e2e          # browser tests (Playwright, needs Chromium)
```

## How the live caption pipeline works

1. `getUserMedia` returns a MediaStream with video + audio tracks
2. The audio track is *cloned* (so MediaRecorder and AudioContext don't
   compete on the same track) and fed into an
   `AudioContext({ sampleRate: 16000 })` connected to an AudioWorklet
   at `/public/audio-worklet.js`
3. Worklet → muted gain → destination (required: Web Audio prunes
   worklet nodes without a path to destination)
4. The worklet emits ~250ms PCM chunks + RMS to the main thread
5. `useTranscription` maintains a 6-second rolling buffer
6. Every 2 seconds, the most recent 4-second window is sent to the
   worker; transformers.js distil-medium.en returns text
7. `useStats` computes WPM / filler % / pauses / volatility every 10s
   from `LocalWindow[]` and `rmsSamples[]`

## How the post-stop pipeline works

1. User presses Stop. `recorder.stop()` returns a Promise resolving to
   `{ videoBlob, audioBlob, ... }` once both MediaRecorders fire `onstop`
2. The page transitions to Analysis. Download chips work immediately.
3. `transcription.transcribeFull(audioBlob)`:
   a. Decodes the blob via `decodeAudioData`
   b. Renders to 16kHz mono PCM via `OfflineAudioContext`
   c. Posts to the worker with `transcribeFull` (return_timestamps: true)
   d. Returns `{ text, duration, segments: [{ start, end, text }] }`
4. The transcript + optional context + final stats are POSTed to
   `/api/analyze`. The route uses `generateObject` with the Zod
   `feedbackSchema` and the model string from env.
5. The Transcript section renders the moment step 3 completes; the
   analysis renders when step 4 completes.

Note: transformers.js's pipeline doesn't expose per-segment
`avg_logprob`, so the confidence-tier highlighting we built only fires
when segments arrive with logprobs (none do today). The Transcript
component auto-hides the legend in that case.

## Gotchas (real ones, hit during build)

- **Model files are served from our own R2 bucket, NOT huggingface.co.**
  `env.remoteHost` in `lib/whisper.worker.ts` points at
  `pub-…​.r2.dev` (bucket `rehearsal-models`, CF account
  `06f19773f1bb9140a90893c4310cdbb5`). The bucket mirrors the exact HF
  layout (`distil-whisper/distil-medium.en/resolve/main/…`) so
  transformers.js's default path template just works. WHY this exists:
  - **HF/CloudFront CORS poisoning.** HF serves model files via
    CloudFront with `Vary: Origin` + a *conditional* ACAO (echoes the
    request Origin, or `https://huggingface.co` when none). CloudFront's
    Vary handling is unreliable, so the deployed `*.workers.dev` origin
    intermittently gets a cached response with the wrong ACAO →
    persistent "No 'Access-Control-Allow-Origin'". curl always works
    (cache miss) → it's the CDN, not our code. Clearing browser cache
    does nothing. A `?cache-bust` param did not reliably fix it.
  - **Proxying through a CF Worker is dead.** OpenNext's streaming
    layer truncates large bodies (~2–6 MB) regardless of cache
    headers → the 1.17 GB encoder arrives corrupt → ONNX protobuf
    parse failure. Confirmed by curl byte-count.
  - **R2 public bucket is served by CF's storage edge, not the
    Worker** → clean unconditional `ACAO: *`, no size cap, free egress.
  - **Refreshing the mirror:** `wrangler r2 object put` is hard-capped
    at 300 MiB, so the two big ONNX files (`encoder_model.onnx`
    1.17 GB, `decoder_model_merged.onnx` 333 MiB) must go via S3
    multipart: `aws s3 cp <file> s3://rehearsal-models/<key> --profile
    r2 --endpoint-url https://06f19773f1bb9140a90893c4310cdbb5.r2.cloudflarestorage.com`.
    The `r2` aws profile needs an R2 S3 API token (dashboard → R2 →
    Manage R2 API Tokens; wrangler can't mint these). Metadata files
    (<300 MiB) can use `wrangler r2 object put --remote`. Keys mirror
    `distil-whisper/distil-medium.en/resolve/main/…`. Bucket CORS is
    `ACAO:*` GET/HEAD (see `wrangler r2 bucket cors`).
- **Cactus has no browser SDK and no documented Cloud HTTP transcription
  API.** Tried Groq for a post-stop cloud pass; abandoned it in favour
  of running `distil-medium.en` locally for both live captions and the
  final transcript. The app is now 100% on-device for transcription.
  Only `/api/analyze` (the LLM) is networked.
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
