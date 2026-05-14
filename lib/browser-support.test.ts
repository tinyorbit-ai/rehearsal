import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkSupport } from "./browser-support";

type WriteableNavigator = Navigator & {
  mediaDevices?: { getUserMedia?: unknown };
  gpu?: unknown;
};

function setupFakeAudioContext(withAudioWorklet: boolean) {
  function FakeAudioCtx() {}
  if (withAudioWorklet) {
    Object.defineProperty(FakeAudioCtx.prototype, "audioWorklet", {
      value: {},
      configurable: true,
    });
  }
  globalThis.AudioContext = FakeAudioCtx as unknown as typeof AudioContext;
}

describe("checkSupport", () => {
  const originalMR = globalThis.MediaRecorder;
  const originalAC = globalThis.AudioContext;
  const originalGetUM = (navigator as WriteableNavigator).mediaDevices?.getUserMedia;
  const originalGpu = (navigator as WriteableNavigator).gpu;

  beforeEach(() => {
    globalThis.MediaRecorder = function () {} as unknown as typeof MediaRecorder;
    setupFakeAudioContext(true);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });
  });

  afterEach(() => {
    globalThis.MediaRecorder = originalMR;
    globalThis.AudioContext = originalAC;
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: originalGetUM },
      configurable: true,
    });
    if (originalGpu !== undefined) {
      Object.defineProperty(navigator, "gpu", { value: originalGpu, configurable: true });
    } else {
      delete (navigator as WriteableNavigator).gpu;
    }
  });

  it("reports canRun=true when MediaRecorder + audioWorklet + getUserMedia exist", () => {
    const r = checkSupport();
    expect(r.canRun).toBe(true);
    expect(r.mediaRecorder).toBe(true);
    expect(r.audioWorklet).toBe(true);
    expect(r.getUserMedia).toBe(true);
  });

  it("sets slowFallback=true when WebGPU is missing but other APIs exist", () => {
    delete (navigator as WriteableNavigator).gpu;
    const r = checkSupport();
    expect(r.webgpu).toBe(false);
    expect(r.canRun).toBe(true);
    expect(r.slowFallback).toBe(true);
  });

  it("sets webgpu=true when navigator.gpu exists", () => {
    Object.defineProperty(navigator, "gpu", { value: {}, configurable: true });
    const r = checkSupport();
    expect(r.webgpu).toBe(true);
    expect(r.slowFallback).toBe(false);
  });

  it("sets canRun=false when MediaRecorder is missing", () => {
    // @ts-expect-error — intentionally clearing
    globalThis.MediaRecorder = undefined;
    const r = checkSupport();
    expect(r.mediaRecorder).toBe(false);
    expect(r.canRun).toBe(false);
    expect(r.slowFallback).toBe(false);
  });

  it("sets canRun=false when getUserMedia is missing", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {},
      configurable: true,
    });
    const r = checkSupport();
    expect(r.getUserMedia).toBe(false);
    expect(r.canRun).toBe(false);
  });

  it("sets audioWorklet=false when AudioContext.prototype lacks it", () => {
    setupFakeAudioContext(false);
    const r = checkSupport();
    expect(r.audioWorklet).toBe(false);
    expect(r.canRun).toBe(false);
  });
});
