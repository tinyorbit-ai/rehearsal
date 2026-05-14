# Contributing to The Rehearsal

Thanks for thinking about contributing. This is a small project — the
maintenance loop is light, and the bar is "does it make rehearsing more
useful and less awkward."

## Before you start

- **Open an issue first** for anything bigger than a typo or a one-line fix.
  Saves you the pain of a polished PR that we end up not landing because
  the scope was different from what we wanted.
- Trivial fixes (typos, broken links, obvious bugs in tests) — just send
  the PR.

## Local dev

```bash
git clone https://github.com/tinyorbit-ai/rehearsal.git
cd rehearsal
pnpm install
cp .env.example .env.local      # then fill in AI_GATEWAY_API_KEY
pnpm dev                        # http://localhost:3000
```

You need Node 20+ and pnpm 9+. Anything that runs Chromium 113+ will work
in the browser; WebGPU isn't required but is meaningfully faster.

## Before opening a PR

Every PR should pass three guards:

```bash
pnpm lint
pnpm tsc --noEmit
pnpm test:run
```

If you're touching anything that goes through the browser pipeline
(MediaRecorder, AudioWorklet, the Web Worker, the upload flow), also run
the e2e suite:

```bash
pnpm exec playwright install chromium    # one-time
pnpm test:e2e
```

E2E tests reuse a running `pnpm dev` if one is up, or spawn one
transiently.

## How tests are organised

| Layer | Where | Runtime |
|---|---|---|
| Pure helpers | `lib/*.test.ts` | Vitest, jsdom |
| Hooks | `lib/use-*.test.tsx` | Vitest, jsdom |
| Components | `components/*.test.tsx` | Vitest, jsdom, RTL |
| API routes | `app/api/**/route.test.ts` | Vitest, **node** env (see header in each file) |
| End-to-end | `tests/e2e/*.spec.ts` | Playwright, real Chromium |

A few things we've learned the hard way:

- `vi.mock()` factories that reference top-level vars need `vi.hoisted` to
  set those vars — otherwise the factory captures undefined.
- For mocks that get called with `new` (e.g. `new PDFParse(...)`), use a
  plain `function` constructor in the factory. `vi.fn().mockImplementation`
  isn't reliably constructable.
- API route tests must declare `// @vitest-environment node` at the top.
  jsdom's `File`/`FormData`/`Request` interop hangs on `formData()`.
- `waitFor` and `vi.useFakeTimers()` don't mix. Use direct state checks
  right after `vi.advanceTimersByTime`.
- jsdom doesn't implement `Element.prototype.scrollIntoView` — it's stubbed
  in `tests/setup.ts`.

## Architecture pointers

`CLAUDE.md` is the canonical architecture doc. It's also the context file
for AI coding assistants — keep it accurate when you change anything
structural.

The big picture:

- Everything except `/api/analyze` and `/api/parse-file` runs in the
  browser. Audio + video never leave the device.
- Transcription is `transformers.js` running Whisper in a Web Worker,
  WebGPU when available, WASM fallback otherwise.
- React Compiler is enabled in `next.config.ts` — don't add manual
  `useCallback` / `useMemo` unless profiling shows the compiler missed it.

## Style

- Match the surrounding code. There's no separate style guide.
- Prefer editing existing files over creating new ones.
- No comments unless the *why* is non-obvious.
- Don't add abstractions until there's a second concrete caller.

## Code of conduct

By participating in this project you agree to abide by the
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree your contributions will be licensed under the
[MIT License](./LICENSE).
