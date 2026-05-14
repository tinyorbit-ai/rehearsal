import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStats } from "./stats";
import type { LocalWindow } from "./transcription";

function makeWindow(text: string, t: number, durationSec = 4): LocalWindow {
  return { text, t, durationSec };
}

describe("useStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns EMPTY_STATS before the warmup elapses", () => {
    const { result } = renderHook(() =>
      useStats({
        localWindows: [makeWindow("hello world", 5)],
        rmsSamples: [],
        elapsedSec: 5,
        active: true,
      }),
    );
    expect(result.current.snapshot.takenAt).toBe(0);
    expect(result.current.snapshot.wpm).toBe(0);

    // Just before warmup ends — no tick yet.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.snapshot.takenAt).toBe(0);
  });

  it("emits the first snapshot after the warmup completes", () => {
    const recent = makeWindow("one two three four five six seven eight nine ten", 5, 4);
    const { result } = renderHook(() =>
      useStats({
        localWindows: [recent],
        rmsSamples: [],
        elapsedSec: 5,
        active: true,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(result.current.snapshot.wpm).toBe(150);
    expect(result.current.snapshot.takenAt).toBeGreaterThan(0);
  });

  it("re-emits snapshots on the interval cadence", () => {
    const { result, rerender } = renderHook(
      (props: { windows: LocalWindow[]; elapsed: number }) =>
        useStats({
          localWindows: props.windows,
          rmsSamples: [],
          elapsedSec: props.elapsed,
          active: true,
          warmupMs: 1000,
          intervalMs: 5000,
        }),
      {
        initialProps: {
          windows: [makeWindow("one two three four five six seven eight nine ten", 5, 4)],
          elapsed: 5,
        },
      },
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const first = result.current.snapshot;
    expect(first.wpm).toBe(150);

    // Swap to a slower window before the next tick.
    rerender({
      windows: [makeWindow("one two three four five", 15, 4)],
      elapsed: 15,
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.snapshot.wpm).toBe(75);
    expect(result.current.snapshot.paceTrend).toBe(75 - 150);
  });

  it("resets the snapshot when active flips to false", () => {
    const { result, rerender } = renderHook(
      (props: { active: boolean }) =>
        useStats({
          localWindows: [makeWindow("one two three four five six seven eight nine ten", 5, 4)],
          rmsSamples: [],
          elapsedSec: 5,
          active: props.active,
          warmupMs: 1000,
        }),
      { initialProps: { active: true } },
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.snapshot.wpm).toBe(150);

    act(() => {
      rerender({ active: false });
    });
    expect(result.current.snapshot.wpm).toBe(0);
    expect(result.current.snapshot.takenAt).toBe(0);
  });

  it("ticks lastUpdateAgoSec on its own 1Hz interval", () => {
    const { result } = renderHook(() =>
      useStats({
        localWindows: [makeWindow("one two three four five six", 5, 4)],
        rmsSamples: [],
        elapsedSec: 5,
        active: true,
        warmupMs: 1000,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const ago0 = result.current.lastUpdateAgoSec;
    expect(ago0).toBe(0);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.lastUpdateAgoSec).toBeGreaterThanOrEqual(2);
  });
});
