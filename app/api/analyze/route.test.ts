// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import type { Feedback } from "@/lib/feedback-schema";
import { POST, buildPrompt, fmt, type AnalyzeBody } from "./route";

const validFeedback: Feedback = {
  scoreOutOf10: 7.5,
  takeaway: "Good.",
  strengths: ["a", "b"],
  topFixes: [
    { title: "1", detail: "x" },
    { title: "2", detail: "y" },
    { title: "3", detail: "z" },
  ],
  paceFeedback: "p",
  fillerFeedback: "f",
  structureFeedback: "s",
  alignmentFeedback: "",
  rehearsalPrompts: ["a", "b", "c"],
  notableMoments: [
    { time: "0:01", kind: "strong", body: "x" },
    { time: "0:02", kind: "watch", body: "y" },
    { time: "0:03", kind: "strong", body: "z" },
  ],
  starArc: 2,
  keyTermsHit: null,
  keyTermsTotal: null,
};

function post(body: unknown, opts?: { rawBody?: string }) {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.rawBody ?? JSON.stringify(body),
  });
}

describe("fmt", () => {
  it("zero pads minutes and seconds", () => {
    expect(fmt(0)).toBe("00:00");
    expect(fmt(7)).toBe("00:07");
    expect(fmt(65)).toBe("01:05");
    expect(fmt(3665)).toBe("61:05");
  });

  it("floors fractional seconds", () => {
    expect(fmt(7.9)).toBe("00:07");
  });
});

describe("buildPrompt", () => {
  const minimal: AnalyzeBody = {
    transcript: "Hello world.",
    durationSec: 12.5,
  };

  it("always includes the coach preamble and duration", () => {
    const p = buildPrompt(minimal);
    expect(p).toContain("senior delivery coach");
    expect(p).toContain("Recording duration: 00:12 (12.5 seconds)");
  });

  it("tailors the preamble to the rehearsal kind", () => {
    expect(buildPrompt({ ...minimal, kind: "presentation" })).toContain(
      "conference talk or presentation",
    );
    expect(buildPrompt({ ...minimal, kind: "pitch" })).toContain(
      "sales pitch or product demo",
    );
    expect(buildPrompt({ ...minimal, kind: "interview" })).toContain(
      "job interview answer",
    );
  });

  it("instructs the model to null starArc for non-interview kinds", () => {
    expect(buildPrompt({ ...minimal, kind: "presentation" })).toContain(
      "STAR arc: set to null",
    );
    expect(buildPrompt({ ...minimal, kind: "interview" })).toContain(
      "STAR arc: count how many",
    );
  });

  it("falls back to raw transcript when no segments are provided", () => {
    const p = buildPrompt(minimal);
    expect(p).toContain("Transcript:");
    expect(p).toContain("Hello world.");
    expect(p).not.toContain("Transcript with timestamps:");
  });

  it("renders segments with mm:ss timestamps when provided", () => {
    const p = buildPrompt({
      ...minimal,
      segments: [
        { start: 0, end: 3.2, text: "first segment" },
        { start: 3.2, end: 6.5, text: "second segment" },
      ],
    });
    expect(p).toContain("Transcript with timestamps:");
    expect(p).toContain("[00:00–00:03] first segment");
    expect(p).toContain("[00:03–00:06] second segment");
  });

  it("includes stats line only when stats are present", () => {
    const without = buildPrompt(minimal);
    expect(without).not.toContain("Measured stats");

    const withStats = buildPrompt({
      ...minimal,
      stats: { wpm: 150, fillerPct: 3.2, longPauses: 1, longestPauseSec: 4.1 },
    });
    expect(withStats).toContain("Measured stats: pace 150 wpm");
    expect(withStats).toContain("filler ratio 3.2%");
    expect(withStats).toContain("1 long pauses (longest 4.1s)");
  });

  it("appends each optional context block when provided", () => {
    const p = buildPrompt({
      ...minimal,
      goal: "Keynote at React Summit",
      brief: "30-min talk on React Compiler for senior eng audience…",
      materialText: "Slides outline + speaker notes…",
    });
    expect(p).toContain("What the speaker is rehearsing for:\nKeynote at React Summit");
    expect(p).toContain("Brief / context:\n30-min talk");
    expect(p).toContain("Supporting material:\nSlides outline");
  });

  it("omits context blocks that are not provided", () => {
    const p = buildPrompt(minimal);
    expect(p).not.toContain("What the speaker is rehearsing for:");
    expect(p).not.toContain("Brief / context:");
    expect(p).not.toContain("Supporting material:");
  });
});

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
    delete process.env.ANALYSIS_MODEL;
  });

  afterEach(() => {
    delete process.env.ANALYSIS_MODEL;
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await POST(post(null, { rawBody: "{not json" }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when transcript is missing", async () => {
    const res = await POST(post({ durationSec: 10 }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Empty transcript." });
  });

  it("returns 400 when transcript is whitespace-only", async () => {
    const res = await POST(post({ transcript: "   \n  ", durationSec: 10 }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 200 with feedback on success", async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: validFeedback,
    } as never);
    const res = await POST(
      post({ transcript: "Hello world.", durationSec: 12 }) as never,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      feedback: Feedback;
      modelLabel: string;
      generatedAt: string;
    };
    expect(data.feedback).toEqual(validFeedback);
    expect(data.modelLabel).toBe("openai/gpt-5.5");
    expect(data.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("uses ANALYSIS_MODEL env when no body.model is provided", async () => {
    process.env.ANALYSIS_MODEL = "anthropic/claude-sonnet-4.6";
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: validFeedback,
    } as never);
    const res = await POST(
      post({ transcript: "Hi.", durationSec: 5 }) as never,
    );
    const data = (await res.json()) as { modelLabel: string };
    expect(data.modelLabel).toBe("anthropic/claude-sonnet-4.6");
    expect(vi.mocked(generateObject).mock.calls[0][0]).toMatchObject({
      model: "anthropic/claude-sonnet-4.6",
    });
  });

  it("uses body.model when provided, overriding env", async () => {
    process.env.ANALYSIS_MODEL = "anthropic/claude-sonnet-4.6";
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: validFeedback,
    } as never);
    const res = await POST(
      post({ transcript: "Hi.", durationSec: 5, model: "xai/grok-4.1" }) as never,
    );
    const data = (await res.json()) as { modelLabel: string };
    expect(data.modelLabel).toBe("xai/grok-4.1");
  });

  it("returns 502 when the model call throws", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error("gateway down"));
    const res = await POST(
      post({ transcript: "Hi.", durationSec: 5 }) as never,
    );
    expect(res.status).toBe(502);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("gateway down");
  });

  it("passes the built prompt to generateObject", async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: validFeedback,
    } as never);
    await POST(
      post({
        transcript: "Hi.",
        durationSec: 12,
        stats: { wpm: 150, fillerPct: 3, longPauses: 0, longestPauseSec: 0 },
      }) as never,
    );
    const call = vi.mocked(generateObject).mock.calls[0][0] as {
      prompt: string;
      schema: unknown;
    };
    expect(call.prompt).toContain("Recording duration: 00:12");
    expect(call.prompt).toContain("Measured stats: pace 150 wpm");
    expect(call.schema).toBeDefined();
  });
});
