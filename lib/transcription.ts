"use client";

import { useEffect, useRef, useState } from "react";

export type LocalWindow = {
  text: string;
  /** Recording-clock seconds at which the window ENDED. */
  t: number;
  durationSec: number;
};

export type ModelStatus = "loading" | "ready" | "error" | "transcribing";

const TARGET_SR = 16000;
const WINDOW_SEC = 4;
const STRIDE_SEC = 2;
// Permissive — always send to the model unless the window is essentially
// digital silence. Whisper returns "" cheaply on quiet audio anyway.
const SILENCE_RMS = 0.002;

export type UseTranscriptionReturn = {
  caption: string;
  localWindows: LocalWindow[];
  rmsSamples: { t: number; rms: number }[];
  /** Latest RMS reading (0–1). Useful for live audio-level indicators. */
  currentRms: number;
  status: ModelStatus;
  backend: "webgpu" | "wasm" | null;
  loadProgress: number;
  loadFile: string | null;
  error: string | null;
  start: (audioStream: MediaStream, recordingStartMs: number) => Promise<void>;
  stop: () => void;
  reset: () => void;
};

export function useTranscription(): UseTranscriptionReturn {
  const [caption, setCaption] = useState("");
  const [localWindows, setLocalWindows] = useState<LocalWindow[]>([]);
  const [rmsSamples, setRmsSamples] = useState<{ t: number; rms: number }[]>([]);
  const [currentRms, setCurrentRms] = useState(0);
  const [status, setStatus] = useState<ModelStatus>("loading");
  const [backend, setBackend] = useState<"webgpu" | "wasm" | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadFile, setLoadFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      // Log everything in dev so issues are visible without DevTools spelunking.
      if (process.env.NODE_ENV !== "production") {
        console.debug("[whisper.worker]", m);
      }
      if (m.type === "progress") {
        if (typeof m.progress === "number") setLoadProgress(m.progress);
        if (m.file) setLoadFile(m.file);
        return;
      }
      if (m.type === "ready") {
        setStatus("ready");
        setBackend(m.backend ?? null);
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
      if (m.type === "info") {
        // Worker-side advisory message; non-fatal.
        return;
      }
      if (m.type === "error") {
        setError(m.error ?? "Transcription error");
        setStatus("error");
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

    // Source → worklet → muted gain → destination so the worklet actually
    // runs (Web Audio prunes nodes with no path to destination).
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
    error,
    start,
    stop,
    reset,
  };
}

/** Simple decimator — assumes inputRate >= outputRate. */
function decimate(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
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
