import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Vitals } from "./Vitals";
import { EMPTY_STATS, type StatsSnapshot } from "@/lib/stats";

const liveStats: StatsSnapshot = {
  wpm: 142,
  paceTone: "good",
  paceTrend: 8,
  fillerPct: 3.4,
  fillerTone: "watch",
  fillerTrend: -0.5,
  longPauses: 1,
  longestPauseSec: 3.2,
  pauseTone: "watch",
  volatility: "low",
  volatilityTone: "good",
  takenAt: Date.now(),
};

describe("Vitals", () => {
  it("renders idle stats as em-dashes with a Start button", () => {
    const onStart = vi.fn();
    render(<Vitals mode="idle" canStart onStart={onStart} />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
    const start = screen.getByRole("button", { name: /start recording/i });
    expect(start).toBeEnabled();
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledOnce();
    // Empty placeholders in idle mode
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("disables Start when canStart is false or busy is true", () => {
    const { rerender } = render(<Vitals mode="idle" canStart={false} />);
    expect(screen.getByRole("button", { name: /start recording/i })).toBeDisabled();

    rerender(<Vitals mode="idle" canStart busy />);
    expect(screen.getByRole("button", { name: /requesting access/i })).toBeDisabled();
  });

  it("renders live stats with values, trends, and the elapsed timer", () => {
    render(
      <Vitals
        mode="live"
        stats={liveStats}
        elapsed="01:23"
        lastUpdateAgoSec={4}
        onStop={() => {}}
      />,
    );
    expect(screen.getByText("● Live")).toBeInTheDocument();
    expect(screen.getByText("01:23")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument(); // wpm
    expect(screen.getByText("+8")).toBeInTheDocument(); // pace trend
    expect(screen.getByText("3.4")).toBeInTheDocument(); // filler %
    expect(screen.getByText("-0.5")).toBeInTheDocument(); // filler trend
    expect(screen.getByText("1")).toBeInTheDocument(); // longPauses
    expect(screen.getByText(/longest 3\.2s/)).toBeInTheDocument();
    expect(screen.getByText("low")).toBeInTheDocument(); // volatility
    expect(screen.getByText("4s")).toBeInTheDocument(); // lastUpdateAgoSec
  });

  it("shows the warmup notice while stats haven't ticked yet", () => {
    render(<Vitals mode="live" stats={EMPTY_STATS} elapsed="00:03" onStop={() => {}} />);
    expect(screen.getByText(/Warming up/i)).toBeInTheDocument();
  });

  it("fires onStop when the live Stop button is clicked", () => {
    const onStop = vi.fn();
    render(<Vitals mode="live" stats={liveStats} elapsed="00:30" onStop={onStop} />);
    const stop = screen.getByRole("button", { name: /stop recording/i });
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("omits the trend chip when trend is zero", () => {
    const stats: StatsSnapshot = { ...liveStats, paceTrend: 0, fillerTrend: 0 };
    render(<Vitals mode="live" stats={stats} elapsed="00:10" onStop={() => {}} />);
    expect(screen.queryByText("+0")).not.toBeInTheDocument();
    expect(screen.queryByText("-0")).not.toBeInTheDocument();
  });
});
