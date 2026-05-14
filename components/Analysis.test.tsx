import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Analysis } from "./Analysis";
import type { Feedback } from "@/lib/feedback-schema";
import type { TranscribeResponse } from "@/lib/transcription";
import { EMPTY_STATS } from "@/lib/stats";

const feedback: Feedback = {
  scoreOutOf10: 7.5,
  takeaway: "Strong narrative, weak close.",
  strengths: ["Concrete metrics", "Confident open"],
  topFixes: [
    { title: "Cut filler clusters", detail: "Pause instead of um." },
    { title: "Tighten the close", detail: "End on the result." },
    { title: "Slow down at 1:20", detail: "You sped up." },
  ],
  paceFeedback: "Held 145 wpm.",
  fillerFeedback: "12 'um'.",
  structureFeedback: "STAR S/T/A covered.",
  alignmentFeedback: "",
  rehearsalPrompts: ["Drop recap.", "Add metrics.", "Pause first."],
  notableMoments: [
    { time: "0:42", kind: "strong", body: "Named team size." },
    { time: "1:20", kind: "watch", body: "Three fillers in a row." },
    { time: "2:05", kind: "strong", body: "Measurable impact close." },
  ],
  starArc: 3,
  keyTermsHit: null,
  keyTermsTotal: null,
};

const transcript: TranscribeResponse = {
  text: "hello world",
  duration: 12,
  segments: [{ start: 0, end: 2, text: "hello world", source: "local" }],
};

const baseProps = {
  videoUrl: "blob:fake-video",
  audioUrl: "blob:fake-audio",
  videoMime: "video/webm",
  audioMime: "audio/webm",
  durationSec: 120,
  modelLabel: "openai/gpt-5.5",
  generatedAt: "2026-05-14T12:00:00Z",
  stats: EMPTY_STATS,
  rehearsalKind: "interview" as const,
  contextProvided: false,
  onRetake: () => {},
  onCopyMarkdown: () => {},
};

describe("Analysis", () => {
  it("shows the transcribing loader and no feedback yet", () => {
    render(
      <Analysis
        {...baseProps}
        status="transcribing"
        error={null}
        feedback={null}
        transcript={null}
        modelLabel={null}
        generatedAt={null}
      />,
    );
    expect(screen.getByText(/Transcribing locally/i)).toBeInTheDocument();
    expect(screen.queryByText(feedback.takeaway)).not.toBeInTheDocument();
  });

  it("shows the analyzing loader once transcription is available", () => {
    render(
      <Analysis
        {...baseProps}
        status="analyzing"
        error={null}
        feedback={null}
        transcript={transcript}
        modelLabel={null}
        generatedAt={null}
      />,
    );
    expect(screen.getByText(/Asking the LLM/i)).toBeInTheDocument();
    // Transcript shows as soon as it lands, even while LLM is still working.
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("renders the full review when status is 'ready' and feedback is present", () => {
    render(
      <Analysis
        {...baseProps}
        status="ready"
        error={null}
        feedback={feedback}
        transcript={transcript}
      />,
    );
    expect(screen.getByText("7.5")).toBeInTheDocument();
    expect(screen.getByText(feedback.takeaway)).toBeInTheDocument();
    expect(screen.getByText("Cut filler clusters")).toBeInTheDocument();
    expect(screen.getByText(/Held 145 wpm/)).toBeInTheDocument();
    expect(screen.getByText(/openai\/gpt-5\.5/)).toBeInTheDocument();
  });

  it("shows the error block and a Retake button when status is 'error'", () => {
    render(
      <Analysis
        {...baseProps}
        status="error"
        error="Gateway timeout"
        feedback={null}
        transcript={transcript}
        modelLabel={null}
        generatedAt={null}
      />,
    );
    expect(screen.getByText(/Gateway timeout/)).toBeInTheDocument();
  });

  it("hides the alignment section when no context was provided", () => {
    render(
      <Analysis
        {...baseProps}
        status="ready"
        error={null}
        feedback={{ ...feedback, alignmentFeedback: "Hit 4/5 key terms." }}
        transcript={transcript}
        contextProvided={false}
      />,
    );
    expect(screen.queryByText(/Hit 4\/5 key terms/)).not.toBeInTheDocument();
  });

  it("shows the alignment section when contextProvided is true", () => {
    render(
      <Analysis
        {...baseProps}
        status="ready"
        error={null}
        feedback={{ ...feedback, alignmentFeedback: "Hit 4/5 key terms." }}
        transcript={transcript}
        contextProvided
      />,
    );
    expect(screen.getByText(/Hit 4\/5 key terms/)).toBeInTheDocument();
  });

  it("hides the STAR arc tile for non-interview rehearsals", () => {
    render(
      <Analysis
        {...baseProps}
        status="ready"
        error={null}
        feedback={feedback}
        transcript={transcript}
        rehearsalKind="presentation"
      />,
    );
    expect(screen.queryByText(/STAR arc/i)).not.toBeInTheDocument();
  });

  it("shows the STAR arc tile for interview rehearsals", () => {
    render(
      <Analysis
        {...baseProps}
        status="ready"
        error={null}
        feedback={feedback}
        transcript={transcript}
        rehearsalKind="interview"
      />,
    );
    expect(screen.getByText(/STAR arc/i)).toBeInTheDocument();
  });

  it("disables the review-bundle button until feedback + transcript + video are all present", () => {
    const { rerender } = render(
      <Analysis
        {...baseProps}
        status="transcribing"
        error={null}
        feedback={null}
        transcript={null}
        modelLabel={null}
        generatedAt={null}
      />,
    );
    const findBundle = () =>
      Array.from(document.querySelectorAll("a, button")).find((el) =>
        /review/i.test(el.textContent ?? ""),
      ) as HTMLElement | undefined;

    expect(findBundle()).toBeDisabled();

    rerender(
      <Analysis
        {...baseProps}
        status="ready"
        error={null}
        feedback={feedback}
        transcript={transcript}
      />,
    );
    expect(findBundle()).toBeEnabled();
  });
});
