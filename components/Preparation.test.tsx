import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PREP, Preparation, type Prep } from "./Preparation";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function setFetchResponse(body: Record<string, unknown>, init: { ok?: boolean; status?: number } = {}) {
  const res = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  };
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(res);
}

describe("Preparation", () => {
  it("renders text inputs for title and brief and propagates edits", () => {
    let value = { ...EMPTY_PREP };
    const onChange = vi.fn((next: Prep) => {
      value = next;
    });
    render(<Preparation value={value} onChange={onChange} />);

    const title = screen.getByPlaceholderText(/Keynote at React Summit/i);
    fireEvent.change(title, { target: { value: "Conf talk" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_PREP, goal: "Conf talk" });

    const brief = screen.getByPlaceholderText(/Audience, goals, key messages/i);
    fireEvent.change(brief, { target: { value: "30 min talk on…" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_PREP, brief: "30 min talk on…" });
  });

  it("propagates the rehearsal kind dropdown", () => {
    const onChange = vi.fn();
    render(<Preparation value={EMPTY_PREP} onChange={onChange} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "interview" } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_PREP, kind: "interview" });
  });

  it("offers all four rehearsal kinds", () => {
    render(<Preparation value={EMPTY_PREP} onChange={vi.fn()} />);
    expect(
      screen.getByRole("option", { name: /Conference \/ presentation/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Sales pitch \/ demo/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Job interview/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Other/i })).toBeInTheDocument();
  });

  it("disables inputs visually in compact mode", () => {
    const { container } = render(
      <Preparation value={EMPTY_PREP} onChange={vi.fn()} compact />,
    );
    const section = container.querySelector("section");
    expect(section?.className).toMatch(/pointer-events-none/);
  });

  describe("FileField (supporting material)", () => {
    it("parses an uploaded file and stores the returned text + filename", async () => {
      setFetchResponse({ text: "Slide outline\n- Hook\n- Body" });
      const onChange = vi.fn();
      render(<Preparation value={EMPTY_PREP} onChange={onChange} />);

      const file = new File(["fake-bytes"], "slides.pdf", { type: "application/pdf" });
      const inputs = document.querySelectorAll('input[type="file"]');
      const materialInput = inputs[0] as HTMLInputElement;
      fireEvent.change(materialInput, { target: { files: [file] } });

      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledOnce());
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/parse-file",
        expect.objectContaining({ method: "POST" }),
      );
      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith({
          ...EMPTY_PREP,
          materialText: "Slide outline\n- Hook\n- Body",
          materialName: "slides.pdf",
        }),
      );
    });

    it("renders the parsed file name + char count once material is set", () => {
      const value: Prep = {
        ...EMPTY_PREP,
        materialText: "abcdefghij",
        materialName: "brief.pdf",
      };
      render(<Preparation value={value} onChange={vi.fn()} />);
      expect(screen.getByText("brief.pdf")).toBeInTheDocument();
      expect(screen.getByText("10 chars")).toBeInTheDocument();
    });

    it("clears the parsed file when Remove is clicked", () => {
      const value: Prep = {
        ...EMPTY_PREP,
        materialText: "story",
        materialName: "prep.md",
      };
      const onChange = vi.fn();
      render(<Preparation value={value} onChange={onChange} />);
      const removeBtn = screen.getByText("Remove");
      fireEvent.click(removeBtn);
      expect(onChange).toHaveBeenCalled();
      const next = onChange.mock.calls[0][0] as Prep;
      expect(next.materialText).toBe("");
      expect(next.materialName).toBe("");
    });

    it("surfaces server errors inline without crashing", async () => {
      setFetchResponse({ error: "Unsupported file type" }, { ok: false, status: 415 });
      render(<Preparation value={EMPTY_PREP} onChange={vi.fn()} />);

      const file = new File(["x"], "thing.bin", { type: "application/octet-stream" });
      const input = document.querySelectorAll('input[type="file"]')[0] as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      expect(await screen.findByText(/Unsupported file type/i)).toBeInTheDocument();
    });
  });
});
