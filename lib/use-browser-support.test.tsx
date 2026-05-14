import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserSupport } from "./browser-support";

type WriteableNavigator = Navigator & {
  mediaDevices?: { getUserMedia?: unknown };
  gpu?: unknown;
};

describe("useBrowserSupport", () => {
  const originalMR = globalThis.MediaRecorder;
  const originalAC = globalThis.AudioContext;
  const originalGpu = (navigator as WriteableNavigator).gpu;

  beforeEach(() => {
    globalThis.MediaRecorder = function () {} as unknown as typeof MediaRecorder;
    function FakeAudioCtx() {}
    Object.defineProperty(FakeAudioCtx.prototype, "audioWorklet", {
      value: {},
      configurable: true,
    });
    globalThis.AudioContext = FakeAudioCtx as unknown as typeof AudioContext;
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.MediaRecorder = originalMR;
    globalThis.AudioContext = originalAC;
    if (originalGpu !== undefined) {
      Object.defineProperty(navigator, "gpu", { value: originalGpu, configurable: true });
    } else {
      delete (navigator as WriteableNavigator).gpu;
    }
  });

  it("returns the all-false placeholder before mount and the live report after", () => {
    const { result } = renderHook(() => useBrowserSupport());
    // After the mount effect runs, the report should reflect the fake APIs.
    expect(result.current.mediaRecorder).toBe(true);
    expect(result.current.audioWorklet).toBe(true);
    expect(result.current.getUserMedia).toBe(true);
    expect(result.current.canRun).toBe(true);
  });

  it("reports slowFallback when WebGPU is missing", () => {
    delete (navigator as WriteableNavigator).gpu;
    const { result } = renderHook(() => useBrowserSupport());
    expect(result.current.webgpu).toBe(false);
    expect(result.current.slowFallback).toBe(true);
  });

  it("clears slowFallback when WebGPU is present", () => {
    Object.defineProperty(navigator, "gpu", { value: {}, configurable: true });
    const { result } = renderHook(() => useBrowserSupport());
    expect(result.current.webgpu).toBe(true);
    expect(result.current.slowFallback).toBe(false);
  });
});
