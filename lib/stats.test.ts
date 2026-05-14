import { describe, expect, it } from "vitest";
import {
  computeStats,
  countFillers,
  countWords,
  EMPTY_STATS,
  findLongPauses,
} from "./stats";
import type { LocalWindow } from "./transcription";

describe("countWords", () => {
  it("counts simple words", () => {
    expect(countWords("hello world")).toBe(2);
  });

  it("returns 0 for empty / whitespace", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });

  it("handles contractions as single words", () => {
    expect(countWords("don't can't won't")).toBe(3);
  });

  it("ignores punctuation", () => {
    expect(countWords("hello, world! how are you?")).toBe(5);
  });

  it("collapses repeated whitespace", () => {
    expect(countWords("one  two   three\n\nfour")).toBe(4);
  });
});

describe("countFillers", () => {
  it("counts um/uh family", () => {
    expect(countFillers("um well uh okay")).toBe(2);
  });

  it("counts stretched 'um' variants once each", () => {
    expect(countFillers("umm")).toBe(1);
    expect(countFillers("ummmm")).toBe(1);
    expect(countFillers("um umm ummm")).toBe(3);
    expect(countFillers("ahh")).toBe(1);
  });

  it("matches multi-word fillers", () => {
    expect(countFillers("you know, i mean, kind of, sort of")).toBe(4);
  });

  it("is case-insensitive", () => {
    expect(countFillers("LIKE Basically ACTUALLY")).toBe(3);
  });

  it("respects word boundaries", () => {
    // 'likewise' shouldn't trigger 'like'; 'umbrella' shouldn't trigger 'um'
    expect(countFillers("likewise umbrella basicaly")).toBe(0);
  });

  it("returns 0 for empty input", () => {
    expect(countFillers("")).toBe(0);
  });
});

describe("findLongPauses", () => {
  it("returns zero for fewer than two samples", () => {
    expect(findLongPauses([])).toEqual({ count: 0, longest: 0 });
    expect(findLongPauses([{ t: 0, rms: 0 }])).toEqual({ count: 0, longest: 0 });
  });

  it("finds a single quiet gap", () => {
    // Duration is measured from the first silent sample's t to the t of the
    // sample that breaks the silence — so [t=1 silent .. t=4 loud] = 3s.
    const samples = [
      { t: 0, rms: 0.1 },
      { t: 1, rms: 0.001 },
      { t: 2, rms: 0.001 },
      { t: 3.5, rms: 0.001 },
      { t: 4, rms: 0.1 },
    ];
    const r = findLongPauses(samples);
    expect(r.count).toBe(1);
    expect(r.longest).toBeCloseTo(3, 1);
  });

  it("ignores gaps shorter than minPauseSec", () => {
    const samples = [
      { t: 0, rms: 0.1 },
      { t: 0.5, rms: 0.001 },
      { t: 1.4, rms: 0.001 },
      { t: 1.5, rms: 0.1 },
    ];
    expect(findLongPauses(samples)).toEqual({ count: 0, longest: 0 });
  });

  it("counts multiple separate pauses", () => {
    const samples = [
      { t: 0, rms: 0.1 },
      { t: 1, rms: 0.001 },
      { t: 4, rms: 0.001 },
      { t: 5, rms: 0.1 },
      { t: 6, rms: 0.001 },
      { t: 9, rms: 0.001 },
      { t: 10, rms: 0.1 },
    ];
    const r = findLongPauses(samples);
    expect(r.count).toBe(2);
    expect(r.longest).toBeCloseTo(4, 1);
  });

  it("counts a tail run that never returns to loud", () => {
    const samples = [
      { t: 0, rms: 0.1 },
      { t: 1, rms: 0.001 },
      { t: 5, rms: 0.001 },
    ];
    const r = findLongPauses(samples);
    expect(r.count).toBe(1);
    expect(r.longest).toBeCloseTo(4, 1);
  });

  it("respects the threshold parameter", () => {
    const samples = [
      { t: 0, rms: 0.05 },
      { t: 1, rms: 0.02 },
      { t: 4, rms: 0.02 },
      { t: 5, rms: 0.05 },
    ];
    expect(findLongPauses(samples, 0.012, 2).count).toBe(0);
    expect(findLongPauses(samples, 0.03, 2).count).toBe(1);
  });
});

function makeWindow(text: string, t: number, durationSec = 4): LocalWindow {
  return { text, t, durationSec };
}

describe("computeStats", () => {
  it("returns zeroed stats when there are no recent windows", () => {
    const s = computeStats({
      localWindows: [],
      rmsSamples: [],
      elapsedSec: 0,
    });
    expect(s.wpm).toBe(0);
    expect(s.fillerPct).toBe(0);
    expect(s.longPauses).toBe(0);
    expect(s.paceTone).toBe("watch");
  });

  it("computes wpm from recent windows only (rolling cutoff)", () => {
    // 10 words in a 4s window inside the rolling cutoff → 150 wpm
    const recent = makeWindow("one two three four five six seven eight nine ten", 30);
    const old = makeWindow("a a a a a a a a a a a a a a a a a a a a", 1);
    const s = computeStats({
      localWindows: [old, recent],
      rmsSamples: [],
      elapsedSec: 30,
      rollingSec: 10,
    });
    expect(s.wpm).toBe(150);
    expect(s.paceTone).toBe("good");
  });

  it("tones pace correctly across the bands", () => {
    // wpm = mean(words / window.duration) * 60. With a single 4s window:
    //   6 words → 90 wpm   → warn   (below 110)
    //   8 words → 120 wpm  → watch  ([110, 130))
    //  10 words → 150 wpm  → good   ([130, 160])
    //  11 words → 165 wpm  → watch  ((160, 180])
    //  13 words → 195 wpm  → warn   (above 180)
    const bands: Array<{ words: number; tone: string }> = [
      { words: 6, tone: "warn" },
      { words: 8, tone: "watch" },
      { words: 10, tone: "good" },
      { words: 11, tone: "watch" },
      { words: 13, tone: "warn" },
    ];
    for (const { words, tone } of bands) {
      const text = Array(words).fill("w").join(" ");
      const s = computeStats({
        localWindows: [makeWindow(text, 5, 4)],
        rmsSamples: [],
        elapsedSec: 5,
      });
      expect.soft(s.paceTone, `${words} words → ${s.wpm} wpm`).toBe(tone);
    }
  });

  it("computes filler percentage and tones it", () => {
    // 1 filler in 5 words = 20% → warn
    const s = computeStats({
      localWindows: [makeWindow("um one two three four", 5, 4)],
      rmsSamples: [],
      elapsedSec: 5,
    });
    expect(s.fillerPct).toBe(20);
    expect(s.fillerTone).toBe("warn");
  });

  it("propagates trend from previous snapshot", () => {
    const prev = { ...EMPTY_STATS, wpm: 100, fillerPct: 5 };
    const recent = makeWindow("one two three four five six seven eight nine ten", 5, 4);
    const s = computeStats({
      localWindows: [recent],
      rmsSamples: [],
      elapsedSec: 5,
      prev,
    });
    expect(s.paceTrend).toBe(s.wpm - 100);
    expect(s.fillerTrend).toBe(Math.round((s.fillerPct - 5) * 10) / 10);
  });

  it("counts long pauses from rms samples", () => {
    const s = computeStats({
      localWindows: [],
      rmsSamples: [
        { t: 0, rms: 0.1 },
        { t: 1, rms: 0.001 },
        { t: 4, rms: 0.001 },
        { t: 5, rms: 0.1 },
      ],
      elapsedSec: 5,
    });
    expect(s.longPauses).toBe(1);
    expect(s.longestPauseSec).toBeGreaterThan(2);
  });

  it("stamps takenAt with Date.now()", () => {
    const before = Date.now();
    const s = computeStats({ localWindows: [], rmsSamples: [], elapsedSec: 0 });
    expect(s.takenAt).toBeGreaterThanOrEqual(before);
  });
});
