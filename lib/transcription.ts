"use client";

import { useEffect, useRef, useState } from "react";

export type LocalWindow = {
  text: string;
  /** Recording-clock seconds at which the window ENDED. */
  t: number;
  durationSec: number;
};

export type ModelStatus = "loading" | "ready" | "error" | "transcribing";

export type TranscribeSegment = {
  start: number;
  end: number;
  text: string;
  avgLogprob?: number;
  noSpeechProb?: number;
  source: "local" | "cloud";
};

export type TranscribeResponse = {
  text: string;
  duration: number;
  segments: TranscribeSegment[];
};

const TARGET_SR = 16000;
const WINDOW_SEC = 4;
const STRIDE_SEC = 2;
const SILENCE_RMS = 0.002;

export type UseTranscriptionReturn = {
  caption: string;
  localWindows: LocalWindow[];
  rmsSamples: { t: number; rms: number }[];
  currentRms: number;
  status: ModelStatus;
  backend: "webgpu" | "wasm" | null;
  /** Monotonic byte-weighted percent across ALL model files (0-100). */
  loadProgress: number;
  loadFile: string | null;
  loadBytesDone: number;
  loadBytesTotal: number;
  loadFilesDone: number;
  loadFilesSeen: number;
  error: string | null;
  start: (audioStream: MediaStream, recordingStartMs: number) => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** Run the model on the full recorded audio with timestamps. */
  transcribeFull: (
    audioBlob: Blob,
    onProgress?: (msg: string) => void,
  ) => Promise<TranscribeResponse>;
};

export function useTranscription(): UseTranscriptionReturn {
  const [caption, setCaption] = useState("");
  const [localWindows, setLocalWindows] = useState<LocalWindow[]>([]);
  const [rmsSamples, setRmsSamples] = useState<{ t: number; rms: number }[]>([]);
  const [currentRms, setCurrentRms] = useState(0);
  const [status, setStatus] = useState<ModelStatus>("loading");
  const [backend, setBackend] = useState<"webgpu" | "wasm" | null>(null);
  // Aggregate, byte-weighted download progress across ALL model files.
  // transformers.js fires per-file 0→100 events; we bucket them so the bar
  // doesn't bounce. Latest-monotonic only — never go backward.
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadFile, setLoadFile] = useState<string | null>(null);
  const [loadBytesDone, setLoadBytesDone] = useState(0);
  const [loadBytesTotal, setLoadBytesTotal] = useState(0);
  const [loadFilesDone, setLoadFilesDone] = useState(0);
  const [loadFilesSeen, setLoadFilesSeen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Per-file byte state, kept in a ref so we can mutate without re-renders.
  const fileBytesRef = useRef<Map<string, { loaded: number; total: number }>>(
    new Map(),
  );
  const monotonicPctRef = useRef(0);

  const workerRef = useRef<Worker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const trackCloneRef = useRef<MediaStreamTrack | null>(null);
  const bufferRef = useRef<Float32Array>(new Float32Array(0));
  const lastRunRef = useRef<number>(0);
  const requestIdRef = useRef<number>(0);
  const startMsRef = useRef<number>(0);

  // Boot the worker once on mount — synchronizing with an external Worker
  // is a legit use of useEffect.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = new Worker(new URL("./whisper.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = w;

    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (process.env.NODE_ENV !== "production") {
        console.debug("[whisper.worker]", m);
      }
      if (m.type === "progress") {
        const file: string | undefined = m.file;
        if (file) setLoadFile(file);
        if (
          file &&
          typeof m.loaded === "number" &&
          typeof m.total === "number" &&
          m.total > 0
        ) {
          fileBytesRef.current.set(file, { loaded: m.loaded, total: m.total });
          let bytesDone = 0;
          let bytesTotal = 0;
          let filesDone = 0;
          for (const v of fileBytesRef.current.values()) {
            bytesDone += v.loaded;
            bytesTotal += v.total;
            if (v.loaded >= v.total) filesDone += 1;
          }
          const pct = bytesTotal > 0 ? (bytesDone / bytesTotal) * 100 : 0;
          // Monotonic: never go backward (new file added → denominator grew →
          // pct can dip; we hold the high-water mark instead).
          const mono = Math.max(monotonicPctRef.current, pct);
          monotonicPctRef.current = mono;
          setLoadProgress(mono);
          setLoadBytesDone(bytesDone);
          setLoadBytesTotal(bytesTotal);
          setLoadFilesDone(filesDone);
          setLoadFilesSeen(fileBytesRef.current.size);
        }
        return;
      }
      if (m.type === "ready") {
        setStatus("ready");
        setBackend(m.backend ?? null);
        // Snap to 100% on ready so the bar finishes cleanly even if any file
        // didn't report a final progress event.
        setLoadProgress(100);
        monotonicPctRef.current = 100;
        return;
      }
      if (m.type === "result") {
        const text: string = m.text ?? "";
        if (!text) return;
        const elapsed =
          startMsRef.current ? (performance.now() - startMsRef.current) / 1000 : 0;
        setCaption(text);
        setLocalWindows((prev) =>
          prev.concat({ text, t: elapsed, durationSec: WINDOW_SEC }).slice(-300),
        );
        return;
      }
      if (m.type === "fullResult") {
        // Handled by transcribeFull's per-call listener (added below).
        return;
      }
      if (m.type === "info") return;
      if (m.type === "error") {
        // Only set top-level state for live-caption errors; transcribeFull
        // errors are returned via the per-call listener.
        if (m.id == null) {
          setError(m.error ?? "Transcription error");
          setStatus("error");
        }
      }
    };

    w.postMessage({ type: "init" });

    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  function teardownAudio() {
    workletNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    muteGainRef.current?.disconnect();
    trackCloneRef.current?.stop();
    workletNodeRef.current = null;
    sourceNodeRef.current = null;
    muteGainRef.current = null;
    trackCloneRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    bufferRef.current = new Float32Array(0);
  }

  function handleWorkletMessage(e: MessageEvent) {
    const { pcm, rms, sampleRate } = e.data as {
      pcm: Float32Array;
      rms: number;
      sampleRate: number;
    };

    const resampled =
      sampleRate === TARGET_SR ? pcm : decimate(pcm, sampleRate, TARGET_SR);

    const cap = TARGET_SR * 6;
    const cur = bufferRef.current;
    let merged: Float32Array;
    if (cur.length + resampled.length <= cap) {
      merged = new Float32Array(cur.length + resampled.length);
      merged.set(cur, 0);
      merged.set(resampled, cur.length);
    } else {
      merged = new Float32Array(cap);
      const overflow = cur.length + resampled.length - cap;
      if (overflow >= cur.length) {
        merged.set(resampled.subarray(resampled.length - cap), 0);
      } else {
        merged.set(cur.subarray(overflow), 0);
        merged.set(resampled, cur.length - overflow);
      }
    }
    bufferRef.current = merged;

    const elapsed = (performance.now() - startMsRef.current) / 1000;
    setRmsSamples((prev) => prev.concat({ t: elapsed, rms }).slice(-1200));
    setCurrentRms(rms);

    const now = performance.now();
    const haveSec = merged.length / TARGET_SR;
    if (haveSec >= WINDOW_SEC && now - lastRunRef.current >= STRIDE_SEC * 1000) {
      lastRunRef.current = now;
      const window = merged.subarray(merged.length - WINDOW_SEC * TARGET_SR);
      if (rms < SILENCE_RMS) return;
      const id = ++requestIdRef.current;
      const audio = new Float32Array(window);
      workerRef.current?.postMessage(
        { type: "transcribe", id, audio },
        [audio.buffer],
      );
    }
  }

  async function start(audioStream: MediaStream, recordingStartMs: number) {
    if (audioCtxRef.current) teardownAudio();
    startMsRef.current = recordingStartMs;
    setCaption("");
    setLocalWindows([]);
    setRmsSamples([]);
    setCurrentRms(0);
    setError(null);

    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: TARGET_SR });
    } catch {
      ctx = new AudioContext();
    }
    audioCtxRef.current = ctx;

    try {
      await ctx.audioWorklet.addModule("/audio-worklet.js");
    } catch (err) {
      setError(`Could not load audio worklet: ${(err as Error).message}`);
      setStatus("error");
      teardownAudio();
      return;
    }

    const original = audioStream.getAudioTracks()[0];
    if (!original) {
      setError("No audio track available.");
      setStatus("error");
      teardownAudio();
      return;
    }
    const cloned = original.clone();
    trackCloneRef.current = cloned;
    const isolatedStream = new MediaStream([cloned]);

    const source = ctx.createMediaStreamSource(isolatedStream);
    sourceNodeRef.current = source;

    const node = new AudioWorkletNode(ctx, "pcm-collector");
    workletNodeRef.current = node;
    node.port.onmessage = handleWorkletMessage;

    const mute = ctx.createGain();
    mute.gain.value = 0;
    muteGainRef.current = mute;

    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
  }

  function stop() {
    teardownAudio();
  }

  function reset() {
    teardownAudio();
    setCaption("");
    setLocalWindows([]);
    setRmsSamples([]);
    setCurrentRms(0);
    setError(null);
  }

  async function transcribeFull(
    audioBlob: Blob,
    onProgress?: (msg: string) => void,
  ): Promise<TranscribeResponse> {
    const worker = workerRef.current;
    if (!worker) throw new Error("Worker not initialized");
    onProgress?.("Decoding audio…");
    const { pcm, duration } = await decodeAudioToPCM(audioBlob, TARGET_SR);
    onProgress?.(
      `Transcribing ${formatDuration(duration)} locally with distil-medium.en…`,
    );
    const id = ++requestIdRef.current;
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        const m = e.data;
        if (m.id !== id) return;
        if (m.type === "fullResult") {
          worker.removeEventListener("message", handler);
          const chunks = (m.chunks ?? []) as Array<{
            timestamp: [number, number];
            text: string;
          }>;
          const segments: TranscribeSegment[] = chunks
            .filter((c) => c.timestamp[0] != null && c.text.trim())
            .map((c) => ({
              start: c.timestamp[0] ?? 0,
              end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
              text: c.text.trim(),
              source: "local" as const,
            }));
          // If the model didn't return chunks (small recording), fall back
          // to a single segment spanning the whole audio.
          if (segments.length === 0 && m.text) {
            segments.push({
              start: 0,
              end: duration,
              text: (m.text as string).trim(),
              source: "local",
            });
          }
          resolve({
            text: m.text ?? segments.map((s) => s.text).join(" "),
            duration,
            segments,
          });
        } else if (m.type === "error") {
          worker.removeEventListener("message", handler);
          reject(new Error(m.error ?? "Transcription failed"));
        }
      };
      worker.addEventListener("message", handler);
      worker.postMessage({ type: "transcribeFull", id, audio: pcm }, [pcm.buffer]);
    });
  }

  // Cleanup audio on unmount — external resource lifecycle.
  useEffect(() => {
    return () => {
      teardownAudio();
    };
  }, []);

  return {
    caption,
    localWindows,
    rmsSamples,
    currentRms,
    status,
    backend,
    loadProgress,
    loadFile,
    loadBytesDone,
    loadBytesTotal,
    loadFilesDone,
    loadFilesSeen,
    error,
    start,
    stop,
    reset,
    transcribeFull,
  };
}

/** Decode an encoded audio/video blob to mono PCM at the target sample rate.
 *  Tries decodeAudioData first (works for audio blobs and most video blobs in
 *  Chromium). Falls back to real-time playback capture via a hidden <video>
 *  element for containers decodeAudioData can't handle (some Safari MP4s, etc).
 */
async function decodeAudioToPCM(
  blob: Blob,
  targetSampleRate: number,
): Promise<{ pcm: Float32Array; duration: number }> {
  try {
    return await decodeOffline(blob, targetSampleRate);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[transcription] decodeAudioData failed, falling back to playback capture", err);
    }
    return await decodeViaPlayback(blob, targetSampleRate);
  }
}

async function decodeOffline(
  blob: Blob,
  targetSampleRate: number,
): Promise<{ pcm: Float32Array; duration: number }> {
  const arrayBuffer = await blob.arrayBuffer();
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } finally {
    await decodeCtx.close().catch(() => {});
  }

  const duration = decoded.duration;
  const targetLength = Math.max(1, Math.ceil(duration * targetSampleRate));
  const offline = new OfflineAudioContext(1, targetLength, targetSampleRate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return { pcm: rendered.getChannelData(0).slice(), duration };
}

/** Real-time fallback: load the blob into a hidden <video>, route its decoded
 *  audio through an AudioContext at the target rate, capture PCM via the
 *  same audio-worklet used for live captions. Takes ~playback-duration. */
async function decodeViaPlayback(
  blob: Blob,
  targetSampleRate: number,
): Promise<{ pcm: Float32Array; duration: number }> {
  const url = URL.createObjectURL(blob);
  const media = document.createElement("video");
  media.src = url;
  media.muted = true;
  media.playsInline = true;
  media.crossOrigin = "anonymous";
  media.preload = "auto";

  try {
    await new Promise<void>((resolve, reject) => {
      media.addEventListener("loadedmetadata", () => resolve(), { once: true });
      media.addEventListener("error", () => reject(new Error("Failed to load media for playback capture")), { once: true });
    });

    const duration = isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
    const ctx = new AudioContext({ sampleRate: targetSampleRate });
    await ctx.audioWorklet.addModule("/audio-worklet.js");

    const source = ctx.createMediaElementSource(media);
    const node = new AudioWorkletNode(ctx, "pcm-collector");
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);

    const chunks: Float32Array[] = [];
    let totalLen = 0;
    node.port.onmessage = (e: MessageEvent) => {
      const data = e.data as { pcm: Float32Array };
      if (data?.pcm) {
        chunks.push(data.pcm);
        totalLen += data.pcm.length;
      }
    };

    await media.play();
    await new Promise<void>((resolve, reject) => {
      media.addEventListener("ended", () => resolve(), { once: true });
      media.addEventListener("error", () => reject(new Error("Playback failed during capture")), { once: true });
    });

    // Drain a final flush window so the worklet emits any tail buffer.
    await new Promise((r) => setTimeout(r, 250));

    source.disconnect();
    node.disconnect();
    mute.disconnect();
    await ctx.close().catch(() => {});

    const pcm = new Float32Array(totalLen);
    let off = 0;
    for (const c of chunks) {
      pcm.set(c, off);
      off += c.length;
    }
    return { pcm, duration: duration || pcm.length / targetSampleRate };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function formatDuration(sec: number) {
  // Round the whole value first so 59.6 → 60 → "1m 00s" instead of "0m 60s".
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

/** Simple decimator — assumes inputRate >= outputRate. */
export function decimate(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.floor((i + 1) * ratio);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}
