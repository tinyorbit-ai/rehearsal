/// <reference lib="webworker" />

import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.allowRemoteModels = true;

// distil-whisper/distil-medium.en — whisper-large-class accuracy, runs fully
// on-device. ~400MB first load, cached after. WebGPU on M-series ≈ 4× realtime.
// ONNX files live in the original repo; no Xenova/onnx-community fork needed.
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
