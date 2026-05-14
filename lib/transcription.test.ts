import { describe, expect, it } from "vitest";
import { decimate, formatDuration } from "./transcription";

describe("decimate", () => {
  it("returns the input unchanged when rates match", () => {
    const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const out = decimate(input, 16000, 16000);
    expect(out).toBe(input);
  });

  it("downsamples 48kHz → 16kHz by 3:1 averaging", () => {
    const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const out = decimate(input, 48000, 16000);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo((1 + 2 + 3) / 3, 5);
    expect(out[1]).toBeCloseTo((4 + 5 + 6) / 3, 5);
    expect(out[2]).toBeCloseTo((7 + 8 + 9) / 3, 5);
  });

  it("handles non-integer ratios without crashing", () => {
    const input = new Float32Array(100).fill(1);
    const out = decimate(input, 44100, 16000);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(input.length);
    // every sample is 1, average of any window of 1s is 1
    for (const v of out) expect(v).toBeCloseTo(1, 5);
  });

  it("produces a shorter array for typical downsampling", () => {
    const input = new Float32Array(48000);
    const out = decimate(input, 48000, 16000);
    expect(out.length).toBe(16000);
  });
});

describe("formatDuration", () => {
  it("formats sub-minute durations", () => {
    expect(formatDuration(0)).toBe("0m 00s");
    expect(formatDuration(7)).toBe("0m 07s");
    expect(formatDuration(59)).toBe("0m 59s");
  });

  it("formats minute durations", () => {
    expect(formatDuration(60)).toBe("1m 00s");
    expect(formatDuration(125)).toBe("2m 05s");
  });

  it("rounds seconds to the nearest integer", () => {
    expect(formatDuration(59.4)).toBe("0m 59s");
    expect(formatDuration(61.4)).toBe("1m 01s");
    expect(formatDuration(61.6)).toBe("1m 02s");
  });

  it("carries rounded seconds into the minutes field", () => {
    expect(formatDuration(59.6)).toBe("1m 00s");
    expect(formatDuration(119.5)).toBe("2m 00s");
  });

  it("clamps negative inputs to zero", () => {
    expect(formatDuration(-3)).toBe("0m 00s");
  });
});
