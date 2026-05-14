import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Transcript, confidenceTier, summarize } from "./Transcript";
import type { TranscribeResponse, TranscribeSegment } from "@/lib/transcription";

function seg(over: Partial<TranscribeSegment> = {}): TranscribeSegment {
  return {
    start: 0,
    end: 2,
    text: "hello",
    source: "local",
    ...over,
  };
}

describe("confidenceTier", () => {
  it("returns 'silent' when noSpeechProb is high", () => {
    expect(confidenceTier(seg({ noSpeechProb: 0.7 }))).toBe("silent");
  });

  it("returns 'low' for very negative logprobs", () => {
    expect(confidenceTier(seg({ avgLogprob: -1.5 }))).toBe("low");
  });

  it("returns 'medium' for moderately negative logprobs", () => {
    expect(confidenceTier(seg({ avgLogprob: -0.8 }))).toBe("medium");
  });

  it("returns 'high' for near-zero logprobs", () => {
    expect(confidenceTier(seg({ avgLogprob: -0.2 }))).toBe("high");
    expect(confidenceTier(seg())).toBe("high");
  });
});

describe("summarize", () => {
  it("counts each tier", () => {
    const r = summarize([
      seg({ avgLogprob: -0.1 }),
      seg({ avgLogprob: -0.8 }),
      seg({ avgLogprob: -1.5 }),
      seg({ noSpeechProb: 0.9 }),
    ]);
    expect(r).toEqual({ total: 4, medium: 1, low: 1, silent: 1 });
  });
});

describe("Transcript component", () => {
  function makeTranscript(segs: TranscribeSegment[], source: "local" | "cloud" = "local"): TranscribeResponse {
    return { text: segs.map((s) => s.text).join(" "), duration: 10, segments: segs.map((s) => ({ ...s, source })) };
  }

  it("renders nothing when transcript is null", () => {
    const { container } = render(<Transcript transcript={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders each segment with its mm:ss timestamp", () => {
    const t = makeTranscript([
      seg({ start: 0, end: 3, text: "first" }),
      seg({ start: 30, end: 35, text: "second" }),
    ]);
    render(<Transcript transcript={t} />);
    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.getByText("second")).toBeInTheDocument();
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("00:30")).toBeInTheDocument();
  });

  it("hides the confidence legend when no segment has logprobs", () => {
    const t = makeTranscript([seg({ text: "raw" })]);
    render(<Transcript transcript={t} />);
    expect(screen.queryByText(/logprob/i)).not.toBeInTheDocument();
  });

  it("shows the confidence legend when any segment has logprob info", () => {
    const t = makeTranscript([seg({ avgLogprob: -0.1 }), seg({ avgLogprob: -1.2 })]);
    render(<Transcript transcript={t} />);
    // Legend chip text mentions logprob thresholds
    expect(screen.getByText(/logprob.*−0\.6/i)).toBeInTheDocument();
    expect(screen.getByText(/logprob.*−1\.0/i)).toBeInTheDocument();
  });

  it("labels segments as click-to-jump when onSeek is provided", () => {
    const t = makeTranscript([seg({ text: "click me" })]);
    render(<Transcript transcript={t} onSeek={() => {}} />);
    expect(screen.getByText(/click to jump/i)).toBeInTheDocument();
  });

  it("calls onSeek with the segment start when a row is clicked", () => {
    const t = makeTranscript([seg({ start: 12.34, text: "click target" })]);
    const onSeek = vi.fn();
    render(<Transcript transcript={t} onSeek={onSeek} />);
    fireEvent.click(screen.getByText("click target"));
    expect(onSeek).toHaveBeenCalledWith(12.34);
  });

  it("uses the cloud source label when segments come from Groq", () => {
    const t = makeTranscript([seg({ text: "x" })], "cloud");
    render(<Transcript transcript={t} />);
    expect(screen.getByText(/whisper-large-v3-turbo \(Groq\)/i)).toBeInTheDocument();
  });

  it("uses the local source label by default", () => {
    const t = makeTranscript([seg({ text: "x" })], "local");
    render(<Transcript transcript={t} />);
    expect(screen.getByText(/distil-medium\.en \(on-device\)/i)).toBeInTheDocument();
  });
});
