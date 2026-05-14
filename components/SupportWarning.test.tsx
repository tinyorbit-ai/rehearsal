import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SupportWarning } from "./SupportWarning";
import type { SupportReport } from "@/lib/browser-support";

const allOk: SupportReport = {
  webgpu: true,
  mediaRecorder: true,
  audioWorklet: true,
  getUserMedia: true,
  canRun: true,
  slowFallback: false,
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("SupportWarning", () => {
  it("renders nothing when the browser is fully supported", () => {
    const { container } = render(<SupportWarning report={allOk} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the fatal banner when canRun is false", async () => {
    const report: SupportReport = {
      ...allOk,
      mediaRecorder: false,
      audioWorklet: false,
      canRun: false,
      slowFallback: false,
    };
    render(<SupportWarning report={report} />);
    expect(await screen.findByText(/Unsupported/i)).toBeInTheDocument();
    expect(
      screen.getByText(/missing MediaRecorder \+ AudioWorklet/i),
    ).toBeInTheDocument();
  });

  it("shows the slow-fallback banner when WebGPU is missing", async () => {
    const report: SupportReport = { ...allOk, webgpu: false, slowFallback: true };
    render(<SupportWarning report={report} />);
    expect(await screen.findByText(/Heads up/i)).toBeInTheDocument();
    expect(screen.getByText(/WebGPU isn.t available/i)).toBeInTheDocument();
  });

  it("hides itself when dismissed and persists the choice in localStorage", async () => {
    const report: SupportReport = { ...allOk, webgpu: false, slowFallback: true };
    const { rerender, container } = render(<SupportWarning report={report} />);
    const dismiss = await screen.findByRole("button", { name: /dismiss/i });
    fireEvent.click(dismiss);

    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem("rehearsal.support-dismissed.v1")).toBe("1");

    // A fresh render should also hide.
    rerender(<SupportWarning report={report} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden when the dismissed flag is already set in localStorage", () => {
    localStorage.setItem("rehearsal.support-dismissed.v1", "1");
    const report: SupportReport = { ...allOk, webgpu: false, slowFallback: true };
    const { container } = render(<SupportWarning report={report} />);
    expect(container).toBeEmptyDOMElement();
  });
});
