import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Masthead } from "./Masthead";

describe("Masthead", () => {
  it("always renders the title and subtitle", () => {
    render(<Masthead view="setup" />);
    expect(screen.getByText("The Rehearsal")).toBeInTheDocument();
    expect(
      screen.getByText(/Rehearse your next talk, pitch, or interview/i),
    ).toBeInTheDocument();
  });

  it("renders the section label per view", () => {
    const { rerender } = render(<Masthead view="setup" />);
    expect(screen.getByText("PREPARATION")).toBeInTheDocument();

    rerender(<Masthead view="recording" />);
    expect(screen.getByText("ON AIR")).toBeInTheDocument();

    rerender(<Masthead view="analysis" />);
    expect(screen.getByText("DELIVERY REVIEW")).toBeInTheDocument();
  });

  it("formats the issue date as DD MONTH YYYY", () => {
    render(<Masthead view="setup" />);
    expect(screen.getByText(/^\d{2} [A-Z][a-z]+ \d{4}$/)).toBeInTheDocument();
  });
});
