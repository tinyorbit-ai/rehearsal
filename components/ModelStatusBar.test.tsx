import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ModelStatusBar } from "./ModelStatusBar";

const defaults = {
  loadProgress: 0,
  loadFile: null,
  loadBytesDone: 0,
  loadBytesTotal: 0,
  loadFilesDone: 0,
  loadFilesSeen: 0,
  error: null,
};

describe("ModelStatusBar", () => {
  it("renders nothing when status is 'ready'", () => {
    const { container } = render(
      <ModelStatusBar
        status="ready"
        backend="webgpu"
        {...defaults}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the error message when status is 'error'", () => {
    render(
      <ModelStatusBar
        status="error"
        backend={null}
        {...defaults}
        error="WebGPU init failed"
      />,
    );
    expect(screen.getByText(/Failed/i)).toBeInTheDocument();
    expect(screen.getByText(/WebGPU init failed/)).toBeInTheDocument();
  });

  it("falls back to 'unknown error' when status is 'error' without an error string", () => {
    render(
      <ModelStatusBar status="error" backend={null} {...defaults} />,
    );
    expect(screen.getByText(/unknown error/i)).toBeInTheDocument();
  });

  it("shows download progress when status is 'loading'", () => {
    render(
      <ModelStatusBar
        status="loading"
        backend={null}
        loadProgress={42.7}
        loadFile="model.onnx"
        loadBytesDone={1024 * 1024 * 50}
        loadBytesTotal={1024 * 1024 * 120}
        loadFilesDone={1}
        loadFilesSeen={3}
        error={null}
      />,
    );
    expect(screen.getByText(/Downloading distil-medium\.en/i)).toBeInTheDocument();
    expect(screen.getByText(/model\.onnx/)).toBeInTheDocument();
    expect(screen.getByText("43%")).toBeInTheDocument();
    expect(screen.getByText("1/3 files")).toBeInTheDocument();
    expect(screen.getByText("50.0 MB / 120.0 MB")).toBeInTheDocument();
  });

  it("shows the backend label when one is reported", () => {
    render(
      <ModelStatusBar
        status="loading"
        backend="wasm"
        {...defaults}
      />,
    );
    expect(screen.getByText("wasm")).toBeInTheDocument();
  });

  it("truncates long file names", () => {
    const long = "very-long-model-filename-that-keeps-going.onnx";
    render(
      <ModelStatusBar
        status="loading"
        backend={null}
        {...defaults}
        loadProgress={5}
        loadFile={long}
      />,
    );
    expect(screen.getByText(/\.{3}|…/)).toBeInTheDocument();
  });
});
