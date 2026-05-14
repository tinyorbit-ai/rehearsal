# The Rehearsal

Open-source rehearsal tool for talks, pitches, and interviews. Record yourself,
get live captions + delivery stats while you talk, and a structured LLM
critique after. Audio and video never leave your browser — only the final
transcript is sent for analysis.

Built and maintained by [TinyOrbit](https://tinyorbit.ai).

## What it does

- **Webcam + mic recording** with downloadable .webm video and .webm audio.
- **Live captions** via on-device Whisper (`distil-whisper/distil-medium.en`,
  ~400 MB first-load, cached after). WebGPU when available, WASM fallback.
- **Rolling delivery vitals every 10 s** — words per minute, filler ratio,
  long-pause count + longest pause, pace volatility.
- **Post-stop LLM critique** — score, takeaway, strengths, top three fixes,
  pace / filler / structure / alignment feedback, rehearsal prompts, notable
  moments with mm:ss timestamps, STAR-arc coverage when relevant.
- **Optional context** — paste a goal, job description, CV, or prep notes
  (PDF/MD/TXT) so the critique is grounded in what you're actually preparing
  for.
- **Self-contained review bundle** — download a single .html file with the
  recording + transcript + analysis embedded.

## Privacy

| Data | Where it goes |
|---|---|
| Video stream | Stays in your browser. Never uploaded. |
| Audio stream | Stays in your browser. Never uploaded. |
| Transcription | Runs on-device via transformers.js + Whisper. |
| Transcript text | Sent to your configured AI Gateway for analysis. |
| Prep doc / CV / JD | Parsed server-side (PDF → text), then sent with the transcript. |

The only network call the app makes for analysis is `POST /api/analyze`.

## Quick start

```bash
git clone https://github.com/tinyorbit-ai/rehearsal.git
cd rehearsal
pnpm install
cp .env.example .env.local      # then fill in AI_GATEWAY_API_KEY
pnpm dev                        # http://localhost:3000
```

You need:
- **Node 20+**
- **pnpm 9+**
- A Chromium-based browser (Chrome / Edge / Arc) for best performance.
  Firefox + Safari work via the WASM fallback.

## Environment variables

All env vars are **server-side only**. None are exposed to the client bundle.
Do not prefix any of them with `NEXT_PUBLIC_`.

| Var | Purpose | Required |
|---|---|---|
| `AI_GATEWAY_API_KEY` | [Vercel AI Gateway](https://vercel.com/ai-gateway) key for the analysis call | Yes (unless you use a direct provider key) |
| `OPENAI_API_KEY` | Direct OpenAI key, if not using the gateway | Optional |
| `ANTHROPIC_API_KEY` | Direct Anthropic key, if not using the gateway | Optional |
| `ANALYSIS_MODEL` | Model string in `provider/model` format. Defaults to `openai/gpt-5.5`. | No |

Example `ANALYSIS_MODEL` values: `openai/gpt-5.5`, `anthropic/claude-sonnet-4.6`,
`xai/grok-4.1`. Swapping models is a one-line change in `.env.local`.

## Deploy

Built for Vercel out of the box. Push to a Git provider, import in Vercel,
add the env vars in the project settings, and ship.

Caveat: Vercel serverless functions have a **4.5 MB request body limit**.
A 30-minute opus audio recording at ~32 kbps is ~7 MB. The current pipeline
posts only the transcript text (not audio) to `/api/analyze`, so this
doesn't bite for delivery analysis. If you fork to add server-side
transcription, you'll need Vercel Blob or a presigned upload flow.

Any other Node-runtime-capable host works too (Fly, Render, Railway, your
own server). Set the env vars however that host wants them.

## Scripts

```bash
pnpm dev            # dev server (Turbopack, React Compiler enabled)
pnpm build          # production build
pnpm start          # run the production build
pnpm lint           # eslint
pnpm tsc --noEmit   # type check
pnpm test           # vitest in watch mode
pnpm test:run       # vitest run-once
pnpm test:e2e       # playwright (needs Chromium installed)
```

To run Playwright once:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

## Tech

- **Next.js 16** App Router · React 19.2 · Turbopack · React Compiler
- **Tailwind v4** with `@theme` design tokens
- **`@huggingface/transformers`** for on-device Whisper (Web Worker + WebGPU/WASM)
- **`ai`** + **`@ai-sdk/gateway`** for the critique LLM call
- **`zod`** for structured output validation
- **`pdf-parse` v2** for CV / prep doc text extraction

## Contributing

Issues and PRs welcome. Architecture notes, conventions, and known gotchas
live in [`CLAUDE.md`](./CLAUDE.md) — that file is also the canonical context
for AI coding assistants working in this repo.

## License

[MIT](./LICENSE) — Copyright (c) 2026 TinyOrbit.
