import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTranscription } from "./transcription";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  constructor(public scriptURL: URL | string, public options?: WorkerOptions) {
    FakeWorker.instances.push(this);
  }
  // Helper used by tests — dispatch a message *from the worker*.
  emit(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

const originalWorker = globalThis.Worker;

beforeEach(() => {
  FakeWorker.instances = [];
  globalThis.Worker = FakeWorker as unknown as typeof Worker;
});

afterEach(() => {
  globalThis.Worker = originalWorker;
});

describe("useTranscription worker lifecycle", () => {
  it("constructs a worker on mount and posts init", () => {
    renderHook(() => useTranscription());
    expect(FakeWorker.instances).toHaveLength(1);
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledWith({ type: "init" });
  });

  it("starts in 'loading' state and transitions to 'ready' on ready message", () => {
    const { result } = renderHook(() => useTranscription());
    expect(result.current.status).toBe("loading");

    act(() => {
      FakeWorker.instances[0].emit({ type: "ready", backend: "webgpu" });
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.backend).toBe("webgpu");
    expect(result.current.loadProgress).toBe(100);
  });

  it("transitions to 'error' on a top-level error message and surfaces the message", () => {
    const { result } = renderHook(() => useTranscription());

    act(() => {
      FakeWorker.instances[0].emit({ type: "error", error: "WebGPU init crashed" });
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("WebGPU init crashed");
  });

  it("ignores error messages tagged with an id (per-call errors)", () => {
    const { result } = renderHook(() => useTranscription());

    act(() => {
      FakeWorker.instances[0].emit({ type: "error", id: 42, error: "per-call boom" });
    });

    // Top-level status should stay loading; per-call errors are handled by
    // the transcribeFull listener, not the global state.
    expect(result.current.status).toBe("loading");
    expect(result.current.error).toBeNull();
  });

  it("terminates the worker on unmount", () => {
    const { unmount } = renderHook(() => useTranscription());
    const worker = FakeWorker.instances[0];
    unmount();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

describe("useTranscription loadProgress aggregation", () => {
  it("aggregates byte-weighted progress across files", () => {
    const { result } = renderHook(() => useTranscription());
    const w = FakeWorker.instances[0];

    act(() => {
      w.emit({ type: "progress", file: "model.onnx", loaded: 50, total: 100 });
    });
    expect(result.current.loadProgress).toBe(50);

    act(() => {
      w.emit({ type: "progress", file: "model.onnx", loaded: 100, total: 100 });
    });
    expect(result.current.loadProgress).toBe(100);
  });

  it("never goes backward when a new file shows up mid-load", () => {
    const { result } = renderHook(() => useTranscription());
    const w = FakeWorker.instances[0];

    act(() => {
      w.emit({ type: "progress", file: "model.onnx", loaded: 80, total: 100 });
    });
    expect(result.current.loadProgress).toBe(80);

    // A new file appears, denominator grows: raw pct would drop to (80+0)/(100+100)=40.
    act(() => {
      w.emit({ type: "progress", file: "tokenizer.json", loaded: 0, total: 100 });
    });
    expect(result.current.loadProgress).toBe(80);

    act(() => {
      w.emit({ type: "progress", file: "tokenizer.json", loaded: 100, total: 100 });
    });
    expect(result.current.loadProgress).toBe(90);
  });

  it("tracks files-done and files-seen counts", () => {
    const { result } = renderHook(() => useTranscription());
    const w = FakeWorker.instances[0];

    act(() => {
      w.emit({ type: "progress", file: "a.bin", loaded: 100, total: 100 });
      w.emit({ type: "progress", file: "b.bin", loaded: 50, total: 100 });
    });

    expect(result.current.loadFilesSeen).toBe(2);
    expect(result.current.loadFilesDone).toBe(1);
  });

  it("ignores progress messages without total bytes", () => {
    const { result } = renderHook(() => useTranscription());
    const w = FakeWorker.instances[0];

    act(() => {
      w.emit({ type: "progress", file: "early.bin", loaded: 100 });
    });

    expect(result.current.loadFilesSeen).toBe(0);
    expect(result.current.loadProgress).toBe(0);
  });

  it("exposes the most recently seen file name", () => {
    const { result } = renderHook(() => useTranscription());
    const w = FakeWorker.instances[0];

    act(() => {
      w.emit({ type: "progress", file: "model.onnx", loaded: 1, total: 100 });
    });
    expect(result.current.loadFile).toBe("model.onnx");

    act(() => {
      w.emit({ type: "progress", file: "tokenizer.json", loaded: 1, total: 100 });
    });
    expect(result.current.loadFile).toBe("tokenizer.json");
  });
});

describe("useTranscription live caption messages", () => {
  it("appends results to localWindows and updates caption", () => {
    const { result } = renderHook(() => useTranscription());
    const w = FakeWorker.instances[0];

    act(() => {
      w.emit({ type: "ready", backend: "webgpu" });
      w.emit({ type: "result", text: "hello world" });
    });

    expect(result.current.caption).toBe("hello world");
    expect(result.current.localWindows).toHaveLength(1);
    expect(result.current.localWindows[0].text).toBe("hello world");
  });

  it("ignores empty result messages", () => {
    const { result } = renderHook(() => useTranscription());
    const w = FakeWorker.instances[0];

    act(() => {
      w.emit({ type: "result", text: "" });
    });

    expect(result.current.caption).toBe("");
    expect(result.current.localWindows).toHaveLength(0);
  });
});
