import { describe, expect, it } from "vitest";
import { feedbackSchema, type Feedback } from "./feedback-schema";

const valid: Feedback = {
  scoreOutOf10: 7.5,
  takeaway: "Strong opening, weak close.",
  strengths: ["Clear narrative", "Confident tone"],
  topFixes: [
    { title: "Cut filler clusters", detail: "Pause instead of 'um'." },
    { title: "Tighten the close", detail: "End on the result." },
    { title: "Slow down at 1:20", detail: "You sped up under pressure." },
  ],
  paceFeedback: "Held 145 wpm.",
  fillerFeedback: "12 'um', 4 'like'.",
  structureFeedback: "STAR covered S/T/A.",
  alignmentFeedback: "",
  rehearsalPrompts: ["Drop the recap.", "Add metrics.", "Pause before the punchline."],
  notableMoments: [
    { time: "0:42", kind: "strong", body: "Named team size." },
    { time: "1:20", kind: "watch", body: "Three fillers in a row." },
    { time: "2:05", kind: "strong", body: "Closed with measurable impact." },
  ],
  starArc: 3,
  keyTermsHit: null,
  keyTermsTotal: null,
};

describe("feedbackSchema", () => {
  it("accepts a fully valid payload", () => {
    const r = feedbackSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("accepts numeric keyTerms when provided", () => {
    const r = feedbackSchema.safeParse({
      ...valid,
      keyTermsHit: 5,
      keyTermsTotal: 12,
    });
    expect(r.success).toBe(true);
  });

  it("accepts null starArc (non-interview rehearsals)", () => {
    const r = feedbackSchema.safeParse({ ...valid, starArc: null });
    expect(r.success).toBe(true);
  });

  it("rejects scoreOutOf10 out of bounds", () => {
    expect(feedbackSchema.safeParse({ ...valid, scoreOutOf10: -1 }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, scoreOutOf10: 11 }).success).toBe(false);
  });

  it("requires strengths to have between 2 and 6 entries", () => {
    expect(feedbackSchema.safeParse({ ...valid, strengths: ["only one"] }).success).toBe(false);
    expect(
      feedbackSchema.safeParse({
        ...valid,
        strengths: ["a", "b", "c", "d", "e", "f", "g"],
      }).success,
    ).toBe(false);
  });

  it("requires exactly three topFixes", () => {
    expect(
      feedbackSchema.safeParse({
        ...valid,
        topFixes: valid.topFixes.slice(0, 2),
      }).success,
    ).toBe(false);
    expect(
      feedbackSchema.safeParse({
        ...valid,
        topFixes: [...valid.topFixes, { title: "x", detail: "y" }],
      }).success,
    ).toBe(false);
  });

  it("requires exactly three rehearsalPrompts", () => {
    expect(
      feedbackSchema.safeParse({
        ...valid,
        rehearsalPrompts: ["only", "two"],
      }).success,
    ).toBe(false);
    expect(
      feedbackSchema.safeParse({
        ...valid,
        rehearsalPrompts: ["a", "b", "c", "d"],
      }).success,
    ).toBe(false);
  });

  it("requires between 3 and 7 notableMoments", () => {
    expect(
      feedbackSchema.safeParse({
        ...valid,
        notableMoments: valid.notableMoments.slice(0, 2),
      }).success,
    ).toBe(false);
    expect(
      feedbackSchema.safeParse({
        ...valid,
        notableMoments: Array(8).fill(valid.notableMoments[0]),
      }).success,
    ).toBe(false);
  });

  it("enforces mm:ss format on notableMoments.time", () => {
    const bad = ["1:5", "12:345", "abc", "1.5", "100", ""];
    for (const time of bad) {
      const r = feedbackSchema.safeParse({
        ...valid,
        notableMoments: [
          { time, kind: "strong" as const, body: "x" },
          ...valid.notableMoments.slice(1),
        ],
      });
      expect.soft(r.success, `time="${time}" should be rejected`).toBe(false);
    }
  });

  it("accepts mm:ss edge cases", () => {
    const good = ["0:00", "9:59", "59:59", "99:00"];
    for (const time of good) {
      const r = feedbackSchema.safeParse({
        ...valid,
        notableMoments: [
          { time, kind: "strong" as const, body: "x" },
          ...valid.notableMoments.slice(1),
        ],
      });
      expect.soft(r.success, `time="${time}" should be accepted`).toBe(true);
    }
  });

  it("only accepts 'strong' or 'watch' as moment kind", () => {
    const r = feedbackSchema.safeParse({
      ...valid,
      notableMoments: [
        { time: "0:00", kind: "neutral", body: "x" },
        ...valid.notableMoments.slice(1),
      ],
    });
    expect(r.success).toBe(false);
  });

  it("clamps starArc to 0-4", () => {
    expect(feedbackSchema.safeParse({ ...valid, starArc: -1 }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...valid, starArc: 5 }).success).toBe(false);
    for (const v of [0, 1, 2, 3, 4]) {
      expect.soft(feedbackSchema.safeParse({ ...valid, starArc: v }).success).toBe(true);
    }
  });

  it("rejects negative keyTerms values", () => {
    expect(
      feedbackSchema.safeParse({ ...valid, keyTermsHit: -1, keyTermsTotal: 5 }).success,
    ).toBe(false);
  });
});
