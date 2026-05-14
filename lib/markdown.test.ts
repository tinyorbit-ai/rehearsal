import { describe, expect, it } from "vitest";
import type { Feedback } from "./feedback-schema";
import { feedbackToMarkdown } from "./markdown";

const baseFeedback: Feedback = {
  scoreOutOf10: 7.5,
  takeaway: "Strong opening, weak close.",
  strengths: ["Clear narrative", "Confident tone"],
  topFixes: [
    { title: "Cut filler clusters", detail: "Pause instead of 'um'." },
    { title: "Tighten the close", detail: "End on the result, not a recap." },
    { title: "Slow down at 1:20", detail: "You sped up under pressure." },
  ],
  paceFeedback: "Held 145 wpm; spiked at 1:20.",
  fillerFeedback: "12 'um', 4 'like'.",
  structureFeedback: "STAR covered S/T/A; R was implicit.",
  alignmentFeedback: "",
  rehearsalPrompts: ["Drop the recap.", "Add metrics.", "Pause before the punchline."],
  notableMoments: [
    { time: "0:42", kind: "strong", body: "Named the team size explicitly." },
    { time: "1:20", kind: "watch", body: "Three fillers in a row." },
    { time: "2:05", kind: "strong", body: "Closed with measurable impact." },
  ],
  starArc: 3,
  keyTermsHit: null,
  keyTermsTotal: null,
};

describe("feedbackToMarkdown", () => {
  it("renders the full document with all required sections", () => {
    const md = feedbackToMarkdown(baseFeedback, "openai/gpt-5.5", "2026-05-14T12:00:00Z");
    expect(md).toContain("# Delivery review");
    expect(md).toContain("**Score: 7.5 / 10**");
    expect(md).toContain("Strong opening");
    expect(md).toContain("## Strengths");
    expect(md).toContain("- Clear narrative");
    expect(md).toContain("## Top three fixes");
    expect(md).toContain("1. **Cut filler clusters**");
    expect(md).toContain("## Pace");
    expect(md).toContain("## Filler words");
    expect(md).toContain("## Structure");
    expect(md).toContain("## Rehearsal prompts");
    expect(md).toContain("1. Drop the recap.");
    expect(md).toContain("## Notable moments");
    expect(md).toContain("- **0:42** _(strong)_ — Named the team size explicitly.");
    expect(md).toContain("STAR arc: 3 / 4");
  });

  it("omits STAR arc when starArc is null", () => {
    const md = feedbackToMarkdown({ ...baseFeedback, starArc: null }, null, null);
    expect(md).not.toContain("STAR arc:");
  });

  it("includes Key terms line when keyTerms are set", () => {
    const md = feedbackToMarkdown(
      { ...baseFeedback, keyTermsHit: 4, keyTermsTotal: 5 },
      null,
      null,
    );
    expect(md).toContain("Key terms: 4 / 5");
  });

  it("includes a model/date header line when either is provided", () => {
    const onlyModel = feedbackToMarkdown(baseFeedback, "openai/gpt-5.5", null);
    expect(onlyModel).toContain("_openai/gpt-5.5_");
    expect(onlyModel).not.toContain(" · ");

    const onlyDate = feedbackToMarkdown(baseFeedback, null, "2026-05-14");
    expect(onlyDate).toContain("_2026-05-14_");

    const both = feedbackToMarkdown(baseFeedback, "openai/gpt-5.5", "2026-05-14");
    expect(both).toContain("_openai/gpt-5.5 · 2026-05-14_");
  });

  it("omits the model/date line when neither is provided", () => {
    const md = feedbackToMarkdown(baseFeedback, null, null);
    expect(md).not.toContain("_null_");
    expect(md.split("\n").slice(0, 3)).toEqual(["# Delivery review", "", "**Score: 7.5 / 10**"]);
  });

  it("omits the Alignment section when alignmentFeedback is empty", () => {
    const md = feedbackToMarkdown(baseFeedback, null, null);
    expect(md).not.toContain("## Alignment");
  });

  it("includes the Alignment section when alignmentFeedback is set", () => {
    const md = feedbackToMarkdown(
      { ...baseFeedback, alignmentFeedback: "Mapped 4/5 brief key terms." },
      null,
      null,
    );
    expect(md).toContain("## Alignment");
    expect(md).toContain("Mapped 4/5 brief key terms.");
  });

  it("formats score with exactly one decimal", () => {
    const md = feedbackToMarkdown({ ...baseFeedback, scoreOutOf10: 8 }, null, null);
    expect(md).toContain("**Score: 8.0 / 10**");
  });
});
