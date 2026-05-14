import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Recording } from "./Recording";
import { EMPTY_STATS } from "@/lib/stats";

const baseProps = {
  stream: null,
  caption: "",
  timer: "00:30",
  modelStatus: "ready" as const,
  modelBackend: "webgpu" as const,
  loadProgress: 100,
  loadFile: null,
  transcriptionError: null,
  currentRms: 0,
  stats: EMPTY_STATS,
  lastUpdateAgoSec: 0,
  onStop: () => {},
};

describe("Recording", () => {
  it("shows the timer + 'Listening' line while the model is ready", () => {
    render(<Recording {...baseProps} caption="hello world" />);
    expect(screen.getByText("00:30", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByText(/Listening.*distil-medium\.en on webgpu/i)).toBeInTheDocument();
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("shows the loading status line while the model is downloading", () => {
    render(
      <Recording
        {...baseProps}
        modelStatus="loading"
        modelBackend={null}
        loadProgress={42.7}
        loadFile="model.onnx"
      />,
    );
    expect(screen.getByText(/Loading distil-medium\.en.*model\.onnx.*43%/i)).toBeInTheDocument();
  });

  it("surfaces a transcription error in the caption area", () => {
    render(
      <Recording
        {...baseProps}
        modelStatus="error"
        transcriptionError="WebGPU init crashed"
      />,
    );
    expect(screen.getByText(/Transcription unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Transcription error.*WebGPU init crashed/i)).toBeInTheDocument();
  });

  it("renders a 'Listening…' placeholder when the caption is empty", () => {
    render(<Recording {...baseProps} caption="" />);
    expect(screen.getByText("Listening…")).toBeInTheDocument();
  });

  it("renders the three delivery tips", () => {
    render(<Recording {...baseProps} />);
    // "Pacing" is unique. "Fillers" and "Structure" also appear in the Vitals
    // sidebar, so assert via the unique tip bodies instead.
    expect(screen.getByText(/Pacing/)).toBeInTheDocument();
    expect(screen.getByText(/A small one-beat pause/i)).toBeInTheDocument();
    expect(screen.getByText(/Situation → task → action → result/i)).toBeInTheDocument();
  });

  it("wires the Stop button through Vitals to onStop", () => {
    const onStop = vi.fn();
    render(<Recording {...baseProps} onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
