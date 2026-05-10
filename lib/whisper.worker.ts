/// <reference lib="webworker" />

import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

// Always fetch from the Hub — we don't bundle weights.
env.allowLocalModels = false;
env.allowRemoteModels = true;

const MODEL_ID = "Xenova/whisper-tiny.en";

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let backend: "webgpu" | "wasm" = "wasm";

async function loadTranscriber(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (transcriberPromise) return transcriberPromise;
  transcriberPromise = (async () => {
    const onProgress = (p: { status: string; progress?: number; file?: string }) => {
      (self as unknown as Worker).postMessage({ type: "progress", ...p });
    };

    // Try WebGPU first; fall back to WASM if it fails. Use library defaults
    // for dtype — fp32 with WebGPU on whisper-tiny can OOM on weaker GPUs.
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
    | { type: "transcribe"; id: number; audio: Float32Array };

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
        // Single-shot — our windows are short (4s), no chunking needed.
        // No `language`/`task` here: whisper-tiny.en is English-only and
        // rejects those options.
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
  }
});
