import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRecorder } from "./recorder";

class FakeTrack {
  stop = vi.fn();
  constructor(public kind: string) {}
}

class FakeStream {
  constructor(public tracks: FakeTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static supportedTypes = new Set<string>();
  static isTypeSupported(mime: string) {
    return FakeMediaRecorder.supportedTypes.has(mime);
  }
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  mimeType: string;
  constructor(
    public stream: unknown,
    public options: { mimeType: string; videoBitsPerSecond?: number },
  ) {
    this.mimeType = options.mimeType;
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    // onstop fires async to mirror real MediaRecorder behaviour
    queueMicrotask(() => this.onstop?.());
  }
  pushChunk(size = 1024) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(size)], { type: this.mimeType }) });
  }
}

type WriteableNavigator = Navigator & {
  mediaDevices?: { getUserMedia?: unknown };
};

const originalMR = globalThis.MediaRecorder;
const originalMS = globalThis.MediaStream;
const originalURL = globalThis.URL.createObjectURL;
const originalRevoke = globalThis.URL.revokeObjectURL;
const originalMediaDevices = (navigator as WriteableNavigator).mediaDevices;

function makeFakeStream() {
  return new FakeStream([new FakeTrack("video"), new FakeTrack("audio")]);
}

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.supportedTypes = new Set([
    "video/webm;codecs=vp9,opus",
    "audio/webm;codecs=opus",
  ]);
  globalThis.MediaRecorder = FakeMediaRecorder as unknown as typeof MediaRecorder;
  globalThis.MediaStream = FakeStream as unknown as typeof MediaStream;
  globalThis.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  globalThis.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  globalThis.MediaRecorder = originalMR;
  globalThis.MediaStream = originalMS;
  globalThis.URL.createObjectURL = originalURL;
  globalThis.URL.revokeObjectURL = originalRevoke;
  Object.defineProperty(navigator, "mediaDevices", {
    value: originalMediaDevices,
    configurable: true,
  });
});

function mockGetUserMediaSuccess(stream: MediaStream) {
  const fn = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: fn },
    configurable: true,
  });
  return fn;
}

function mockGetUserMediaFailure(name: string, message: string) {
  // jsdom's DOMException isn't always `instanceof Error`; build a plain object
  // that matches what the hook reads: { name, message }.
  const err = Object.assign(new Error(message), { name });
  const fn = vi.fn().mockRejectedValue(err);
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: fn },
    configurable: true,
  });
  return fn;
}

describe("useRecorder.requestAccess", () => {
  it("transitions setup → requesting → ready and exposes the stream", async () => {
    const stream = makeFakeStream();
    mockGetUserMediaSuccess(stream as unknown as MediaStream);
    const { result } = renderHook(() => useRecorder());

    expect(result.current.state).toBe("idle");

    let returned: MediaStream | null = null;
    await act(async () => {
      returned = await result.current.requestAccess();
    });

    expect(result.current.state).toBe("ready");
    expect(returned).toBe(stream);
    expect(result.current.stream).toBe(stream);
    expect(result.current.audioStream).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("transitions to denied with a friendly message on NotAllowedError", async () => {
    mockGetUserMediaFailure("NotAllowedError", "denied");
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });

    expect(result.current.state).toBe("denied");
    expect(result.current.error).toMatch(/access denied/i);
  });

  it("surfaces generic error messages when not a permission error", async () => {
    mockGetUserMediaFailure("NotFoundError", "camera missing");
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });

    expect(result.current.state).toBe("denied");
    expect(result.current.error).toContain("camera missing");
  });
});

describe("useRecorder.start + stop", () => {
  it("starts both recorders and transitions to recording", async () => {
    const stream = makeFakeStream();
    mockGetUserMediaSuccess(stream as unknown as MediaStream);
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });
    act(() => {
      result.current.start();
    });

    expect(result.current.state).toBe("recording");
    expect(FakeMediaRecorder.instances).toHaveLength(2);
    const [video, audio] = FakeMediaRecorder.instances;
    expect(video.state).toBe("recording");
    expect(audio.state).toBe("recording");
    expect(video.mimeType).toBe("video/webm;codecs=vp9,opus");
    expect(audio.mimeType).toBe("audio/webm;codecs=opus");
    expect(result.current.videoMime).toBe("video/webm;codecs=vp9,opus");
    expect(result.current.audioMime).toBe("audio/webm;codecs=opus");
  });

  it("does not start when no stream is available", () => {
    const { result } = renderHook(() => useRecorder());
    act(() => {
      result.current.start();
    });
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toMatch(/unavailable/i);
  });

  it("returns blobs and URLs after stop resolves", async () => {
    const stream = makeFakeStream();
    mockGetUserMediaSuccess(stream as unknown as MediaStream);
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });
    act(() => {
      result.current.start();
    });

    // Feed chunks into both recorders, then stop.
    const [video, audio] = FakeMediaRecorder.instances;
    act(() => {
      video.pushChunk(2048);
      audio.pushChunk(1024);
    });

    let stopped: Awaited<ReturnType<typeof result.current.stop>> | undefined;
    await act(async () => {
      stopped = await result.current.stop();
    });

    expect(stopped!.videoBlob).toBeInstanceOf(Blob);
    expect(stopped!.audioBlob).toBeInstanceOf(Blob);
    expect(stopped!.videoBlob!.size).toBe(2048);
    expect(stopped!.audioBlob!.size).toBe(1024);
    expect(stopped!.videoUrl).toBe("blob:fake-url");
    expect(stopped!.audioUrl).toBe("blob:fake-url");
    expect(stopped!.videoMime).toBe("video/webm;codecs=vp9,opus");
    expect(stopped!.audioMime).toBe("audio/webm;codecs=opus");
    expect(result.current.state).toBe("stopped");
  });

  it("falls back to the last MIME when none are supported", async () => {
    FakeMediaRecorder.supportedTypes = new Set();
    const stream = makeFakeStream();
    mockGetUserMediaSuccess(stream as unknown as MediaStream);
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });
    act(() => {
      result.current.start();
    });

    const [video, audio] = FakeMediaRecorder.instances;
    expect(video.mimeType).toBe("video/mp4");
    expect(audio.mimeType).toBe("audio/mp4");
  });

  it("auto-stops at the 30-minute cap", async () => {
    const stream = makeFakeStream();
    mockGetUserMediaSuccess(stream as unknown as MediaStream);
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });

    // Fake timers go *after* the async requestAccess so the promise can
    // resolve normally; the hook's tick interval (setInterval) is then under
    // our control.
    vi.useFakeTimers();
    try {
      act(() => {
        result.current.start();
      });
      act(() => {
        vi.advanceTimersByTime(30 * 60 * 1000 + 1000);
      });
      expect(result.current.state).toBe("stopped");
      const [video, audio] = FakeMediaRecorder.instances;
      expect(video.state).toBe("inactive");
      expect(audio.state).toBe("inactive");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useRecorder.release", () => {
  it("stops all tracks and revokes object URLs", async () => {
    const stream = makeFakeStream();
    mockGetUserMediaSuccess(stream as unknown as MediaStream);
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });
    act(() => {
      result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    act(() => {
      result.current.release();
    });

    expect(stream.tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    expect(result.current.stream).toBeNull();
    expect(result.current.videoUrl).toBeNull();
  });

  it("releaseCamera stops tracks but keeps the recorded URLs alive", async () => {
    const stream = makeFakeStream();
    mockGetUserMediaSuccess(stream as unknown as MediaStream);
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });
    act(() => {
      result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    const urlBefore = result.current.videoUrl;
    act(() => {
      result.current.releaseCamera();
    });

    expect(stream.tracks.every((t) => t.stop.mock.calls.length > 0)).toBe(true);
    expect(result.current.stream).toBeNull();
    // URLs survive — Analysis screen still needs to play the recording back.
    expect(result.current.videoUrl).toBe(urlBefore);
    expect(globalThis.URL.revokeObjectURL).not.toHaveBeenCalledWith(urlBefore);
  });
});

describe("useRecorder.reset", () => {
  it("clears recorded URLs and goes back to ready when a stream is held", async () => {
    const stream = makeFakeStream();
    mockGetUserMediaSuccess(stream as unknown as MediaStream);
    const { result } = renderHook(() => useRecorder());

    await act(async () => {
      await result.current.requestAccess();
    });
    act(() => {
      result.current.start();
    });
    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.videoUrl).not.toBeNull();
    act(() => {
      result.current.reset();
    });
    expect(result.current.videoUrl).toBeNull();
    expect(result.current.audioUrl).toBeNull();
    expect(result.current.state).toBe("ready");
  });
});
