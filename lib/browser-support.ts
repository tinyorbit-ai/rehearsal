"use client";

import { useEffect, useState } from "react";

export type SupportReport = {
  webgpu: boolean;
  mediaRecorder: boolean;
  audioWorklet: boolean;
  getUserMedia: boolean;
  /** True if everything required works. WebGPU not required (WASM fallback). */
  canRun: boolean;
  /** True if WebGPU is missing — app works but slower on WASM. */
  slowFallback: boolean;
};

export function checkSupport(): SupportReport {
  if (typeof window === "undefined") {
    return {
      webgpu: false,
      mediaRecorder: false,
      audioWorklet: false,
      getUserMedia: false,
      canRun: false,
      slowFallback: false,
    };
  }
  const webgpu = "gpu" in navigator;
  const mediaRecorder = typeof MediaRecorder !== "undefined";
  const audioWorklet =
    typeof AudioContext !== "undefined" &&
    "audioWorklet" in AudioContext.prototype;
  const getUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
  const canRun = mediaRecorder && audioWorklet && getUserMedia;
  const slowFallback = canRun && !webgpu;
  return { webgpu, mediaRecorder, audioWorklet, getUserMedia, canRun, slowFallback };
}

/** Read once on mount. Capabilities don't change during a session. */
export function useBrowserSupport(): SupportReport {
  const [report, setReport] = useState<SupportReport>(() => ({
    webgpu: false,
    mediaRecorder: false,
    audioWorklet: false,
    getUserMedia: false,
    canRun: false,
    slowFallback: false,
  }));
  useEffect(() => {
    // navigator capabilities can't be read on the server; reconcile on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReport(checkSupport());
  }, []);
  return report;
}
