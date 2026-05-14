import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Setup } from "./Setup";
import { EMPTY_PREP } from "./Preparation";

const baseProps = {
  recorderState: "idle" as const,
  recorderError: null,
  stream: null,
  prep: EMPTY_PREP,
  onPrepChange: vi.fn(),
  onStart: vi.fn(),
  onUpload: vi.fn(),
};

describe("Setup", () => {
  it("renders the empty-camera prompt and Start button when no stream is present", () => {
    render(<Setup {...baseProps} />);
    expect(screen.getByText(/Click start to grant camera/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toBeEnabled();
  });

  it("fires onStart when the Start button is clicked", () => {
    const onStart = vi.fn();
    render(<Setup {...baseProps} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("shows the recorder error message when access was denied", () => {
    render(
      <Setup
        {...baseProps}
        recorderState="denied"
        recorderError="Camera/microphone access denied. Allow it in your browser and refresh."
      />,
    );
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });

  it("disables the Start button while requesting access", () => {
    render(<Setup {...baseProps} recorderState="requesting" />);
    expect(screen.getByRole("button", { name: /requesting access/i })).toBeDisabled();
  });

  it("delegates to onUpload when a video file is picked", () => {
    const onUpload = vi.fn();
    render(<Setup {...baseProps} onUpload={onUpload} />);

    const file = new File([new Uint8Array([0, 0, 0, 0])], "answer.webm", {
      type: "video/webm",
    });
    // The video file input is the one with accept="video/*"; it sits at the
    // top of the Setup screen, before any Preparation file fields.
    const videoInput = document.querySelector('input[type="file"][accept^="video"]') as HTMLInputElement;
    fireEvent.change(videoInput, { target: { files: [file] } });

    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("renders the Preparation drawer below the camera frame", () => {
    render(<Setup {...baseProps} />);
    expect(screen.getByText(/What are you rehearsing for\?/i)).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Keynote at React Summit/i),
    ).toBeInTheDocument();
  });
});
