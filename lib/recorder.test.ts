import { afterEach, describe, expect, it } from "vitest";
import { formatElapsed, pickMime } from "./recorder";

describe("formatElapsed", () => {
  it("zero pads minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("00:00");
  });

  it("handles seconds-only durations", () => {
    expect(formatElapsed(7)).toBe("00:07");
    expect(formatElapsed(59)).toBe("00:59");
  });

  it("rolls over at 60s", () => {
    expect(formatElapsed(60)).toBe("01:00");
    expect(formatElapsed(61)).toBe("01:01");
  });

  it("handles long durations", () => {
    expect(formatElapsed(1800)).toBe("30:00");
    expect(formatElapsed(3661)).toBe("61:01");
  });
});

describe("pickMime", () => {
  const originalMR = globalThis.MediaRecorder;

  afterEach(() => {
    globalThis.MediaRecorder = originalMR;
  });

  it("returns the first supported candidate", () => {
    globalThis.MediaRecorder = {
      isTypeSupported: (m: string) => m === "video/webm;codecs=vp9,opus",
    } as unknown as typeof MediaRecorder;
    const got = pickMime([
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/mp4",
    ]);
    expect(got).toBe("video/webm;codecs=vp9,opus");
  });

  it("skips unsupported candidates and picks the next one", () => {
    globalThis.MediaRecorder = {
      isTypeSupported: (m: string) => m === "video/mp4",
    } as unknown as typeof MediaRecorder;
    const got = pickMime(["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]);
    expect(got).toBe("video/mp4");
  });

  it("falls back to the last candidate when nothing is supported", () => {
    globalThis.MediaRecorder = {
      isTypeSupported: () => false,
    } as unknown as typeof MediaRecorder;
    const got = pickMime(["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]);
    expect(got).toBe("video/mp4");
  });

  it("falls back to the last candidate when MediaRecorder is undefined", () => {
    // @ts-expect-error — intentionally clearing for the test
    globalThis.MediaRecorder = undefined;
    const got = pickMime(["a/b", "c/d"]);
    expect(got).toBe("c/d");
  });
});
