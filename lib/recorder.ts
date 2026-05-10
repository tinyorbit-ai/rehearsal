"use client";

import { useEffect, useRef, useState } from "react";

export type RecorderState =
  | "idle"
  | "requesting"
  | "ready"
  | "recording"
  | "stopped"
  | "denied";

export const MAX_RECORD_SECONDS = 30 * 60;

export type StopResult = {
  videoBlob: Blob | null;
  audioBlob: Blob | null;
  videoUrl: string | null;
  audioUrl: string | null;
  videoMime: string | null;
  audioMime: string | null;
  durationSec: number;
};

export type UseRecorderReturn = {
  state: RecorderState;
  error: string | null;
  elapsedSec: number;
  videoUrl: string | null;
  audioUrl: string | null;
  videoMime: string | null;
  audioMime: string | null;
  recordingStartMs: number | null;
  stream: MediaStream | null;
  audioStream: MediaStream | null;
  requestAccess: () => Promise<MediaStream | null>;
  start: (streamArg?: MediaStream) => void;
  stop: () => Promise<StopResult>;
  reset: () => void;
  release: () => void;
};

function pickMime(candidates: string[]) {
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return candidates[candidates.length - 1];
}

function defer<T>() {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

export function useRecorder(): UseRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [videoMime, setVideoMime] = useState<string | null>(null);
  const [audioMime, setAudioMime] = useState<string | null>(null);
  const [recordingStartMs, setRecordingStartMs] = useState<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

  // Refs for transient values that shouldn't trigger renders.
  const streamRef = useRef<MediaStream | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const audioChunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const elapsedAtStopRef = useRef<number>(0);
  const videoStopRef = useRef<{ promise: Promise<Blob>; resolve: (b: Blob) => void } | null>(null);
  const audioStopRef = useRef<{ promise: Promise<Blob>; resolve: (b: Blob) => void } | null>(null);
  const videoMimeRef = useRef<string | null>(null);
  const audioMimeRef = useRef<string | null>(null);

  async function requestAccess(): Promise<MediaStream | null> {
    setState("requesting");
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      });
      streamRef.current = s;
      setStream(s);
      setAudioStream(new MediaStream(s.getAudioTracks()));
      setState("ready");
      return s;
    } catch (err) {
      const e = err as DOMException;
      setError(
        e.name === "NotAllowedError"
          ? "Camera/microphone access denied. Allow it in your browser and refresh."
          : e.message || "Could not access camera or microphone.",
      );
      setState("denied");
      return null;
    }
  }

  function start(streamArg?: MediaStream) {
    const s = streamArg || streamRef.current || stream;
    if (!s) {
      setError("Cannot start: camera/mic stream unavailable.");
      return;
    }
    streamRef.current = s;

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setVideoUrl(null);
    setAudioUrl(null);
    videoChunksRef.current = [];
    audioChunksRef.current = [];

    const vMime = pickMime([
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ]);
    const aMime = pickMime(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
    videoMimeRef.current = vMime;
    audioMimeRef.current = aMime;
    setVideoMime(vMime);
    setAudioMime(aMime);

    videoStopRef.current = defer<Blob>();
    audioStopRef.current = defer<Blob>();

    const videoRec = new MediaRecorder(s, {
      mimeType: vMime,
      videoBitsPerSecond: 2_500_000,
    });
    videoRec.ondataavailable = (e) => {
      if (e.data.size > 0) videoChunksRef.current.push(e.data);
    };
    videoRec.onstop = () => {
      const blob = new Blob(videoChunksRef.current, { type: vMime });
      videoStopRef.current?.resolve(blob);
    };
    videoRec.start(1000);
    videoRecorderRef.current = videoRec;

    const audioOnlyStream = new MediaStream(s.getAudioTracks());
    const audioRec = new MediaRecorder(audioOnlyStream, { mimeType: aMime });
    audioRec.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    audioRec.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: aMime });
      audioStopRef.current?.resolve(blob);
    };
    audioRec.start(1000);
    audioRecorderRef.current = audioRec;

    const startMs = performance.now();
    startedAtRef.current = startMs;
    setRecordingStartMs(startMs);
    setElapsedSec(0);
    setState("recording");

    tickRef.current = setInterval(() => {
      const sec = Math.floor((performance.now() - startedAtRef.current) / 1000);
      setElapsedSec(sec);
      if (sec >= MAX_RECORD_SECONDS) {
        if (videoRecorderRef.current?.state === "recording") {
          videoRecorderRef.current.stop();
        }
        if (audioRecorderRef.current?.state === "recording") {
          audioRecorderRef.current.stop();
        }
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = null;
        setState("stopped");
      }
    }, 250);
  }

  async function stop(): Promise<StopResult> {
    elapsedAtStopRef.current = Math.floor(
      (performance.now() - startedAtRef.current) / 1000,
    );
    if (videoRecorderRef.current?.state === "recording") {
      videoRecorderRef.current.stop();
    }
    if (audioRecorderRef.current?.state === "recording") {
      audioRecorderRef.current.stop();
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setState("stopped");

    const vP = videoStopRef.current?.promise;
    const aP = audioStopRef.current?.promise;
    const [videoBlob, audioBlob] = await Promise.all([
      vP || Promise.resolve<Blob | null>(null),
      aP || Promise.resolve<Blob | null>(null),
    ]);

    const vUrl = videoBlob ? URL.createObjectURL(videoBlob) : null;
    const aUrl = audioBlob ? URL.createObjectURL(audioBlob) : null;
    setVideoUrl(vUrl);
    setAudioUrl(aUrl);

    return {
      videoBlob,
      audioBlob,
      videoUrl: vUrl,
      audioUrl: aUrl,
      videoMime: videoMimeRef.current,
      audioMime: audioMimeRef.current,
      durationSec: elapsedAtStopRef.current,
    };
  }

  function reset() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setVideoUrl(null);
    setAudioUrl(null);
    setRecordingStartMs(null);
    videoChunksRef.current = [];
    audioChunksRef.current = [];
    setElapsedSec(0);
    setState(streamRef.current ? "ready" : "idle");
  }

  function release() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setAudioStream(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setVideoUrl(null);
    setAudioUrl(null);
    setRecordingStartMs(null);
    setState("idle");
  }

  // Cleanup on unmount — synchronizing with browser resources, legit effect.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Beforeunload guard while recording — DOM event subscription, legit effect.
  useEffect(() => {
    if (state !== "recording") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state]);

  return {
    state,
    error,
    elapsedSec,
    videoUrl,
    audioUrl,
    videoMime,
    audioMime,
    recordingStartMs,
    stream,
    audioStream,
    requestAccess,
    start,
    stop,
    reset,
    release,
  };
}

export function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
