/// <reference lib="webworker" />

import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;

// Serve model files from our own R2 bucket instead of huggingface.co.
// WHY: HF serves via CloudFront with `Vary: Origin` + a *conditional*
// ACAO. CloudFront's Vary handling is unreliable, so the browser
// intermittently gets a cached response with the wrong ACAO →
// persistent "No 'Access-Control-Allow-Origin'" failures on the
// deployed *.workers.dev origin (curl always works → CDN cache, not
// our code). Proxying through a CF Worker was also dead: OpenNext's
// streaming layer truncated the 1.17 GB encoder to a few MB → ONNX
// protobuf parse failure. R2 public buckets are served by CF's
// storage edge (NOT the Worker) with a clean unconditional
// `Access-Control-Allow-Origin: *`, no size cap, free egress.
//
// The bucket mirrors the exact HF path layout, so transformers.js's
// default remotePathTemplate (`{model}/resolve/{revision}/`) resolves
// correctly: <R2>/distil-whisper/distil-medium.en/resolve/main/...
// To refresh the mirror, re-run the upload (see CLAUDE.md gotchas).
env.remoteHost = "https://pub-cc1859ad769246528ec45ebfee7bc518.r2.dev";

// distil-whisper/distil-medium.en — whisper-large-class accuracy, runs
// fully on-device. fp32 on WebGPU (encoder_model.onnx 1.17 GB +
// decoder_model_merged.onnx 332 MB), cached by transformers.js after
// first load. WASM fallback for browsers without WebGPU.
const MODEL_ID = "distil-whisper/distil-medium.en";

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let backend: "webgpu" | "wasm" = "wasm";

type ChunkWithTimestamp = { timestamp: [number, number]; text: string };

async function loadTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (transcriberPromise) return transcriberPromise;
  transcriberPromise = (async () => {
    const onProgress = (p: { status: string; progress?: number; file?: string }) => {
      (self as unknown as Worker).postMessage({ type: "progress", ...p });
    };

    try {
      const t = await pipeline("automatic-speech-recognition", MODEL_ID, {
        device: "webgpu",
        progress_callback: onProgress,
      });
      backend = "webgpu";
      return t as AutomaticSpeechRecognitionPipeline;
    } catch (gpuErr) {
      (self as unknown as Worker).postMessage({
        type: "info",
        info: `WebGPU failed (${(gpuErr as Error).message}); falling back to WASM`,
      });
      const t = await pipeline("automatic-speech-recognition", MODEL_ID, {
        progress_callback: onProgress,
      });
      backend = "wasm";
      return t as AutomaticSpeechRecognitionPipeline;
    }
  })();
  return transcriberPromise;
}

self.addEventListener("message", async (e: MessageEvent) => {
  const data = e.data as
    | { type: "init" }
    | { type: "transcribe"; id: number; audio: Float32Array }
    | { type: "transcribeFull"; id: number; audio: Float32Array };

  if (data.type === "init") {
    try {
      await loadTranscriber();
      (self as unknown as Worker).postMessage({ type: "ready", backend });
    } catch (err) {
      (self as unknown as Worker).postMessage({
        type: "error",
        error: (err as Error).message,
      });
    }
    return;
  }

  if (data.type === "transcribe") {
    try {
      const t = await loadTranscriber();
      const result = (await t(data.audio, {
        chunk_length_s: 30,
        stride_length_s: 0,
        return_timestamps: false,
      })) as { text: string };
      (self as unknown as Worker).postMessage({
        type: "result",
        id: data.id,
        text: result.text.trim(),
      });
    } catch (err) {
      (self as unknown as Worker).postMessage({
        type: "error",
        id: data.id,
        error: (err as Error).message,
      });
    }
    return;
  }

  if (data.type === "transcribeFull") {
    try {
      const t = await loadTranscriber();
      const result = (await t(data.audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true,
      })) as { text: string; chunks?: ChunkWithTimestamp[] };
      const chunks = (result.chunks ?? []).filter((c) => c.timestamp[0] != null);
      (self as unknown as Worker).postMessage({
        type: "fullResult",
        id: data.id,
        text: result.text.trim(),
        chunks,
      });
    } catch (err) {
      (self as unknown as Worker).postMessage({
        type: "error",
        id: data.id,
        error: (err as Error).message,
      });
    }
  }
});
