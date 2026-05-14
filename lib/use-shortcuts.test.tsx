import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useShortcuts } from "./use-shortcuts";

type Handlers = Parameters<typeof useShortcuts>[0];

function makeHandlers(overrides: Partial<Handlers> = {}): Handlers {
  return {
    view: "setup",
    recorderBusy: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRetake: vi.fn(),
    ...overrides,
  };
}

function press(key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    code: key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("useShortcuts", () => {
  it("starts recording on Space from the setup view", () => {
    const h = makeHandlers();
    renderHook(() => useShortcuts(h));
    press("Space");
    expect(h.onStart).toHaveBeenCalledOnce();
    expect(h.onStop).not.toHaveBeenCalled();
  });

  it("stops recording on Space from the recording view", () => {
    const h = makeHandlers({ view: "recording" });
    renderHook(() => useShortcuts(h));
    press("Space");
    expect(h.onStop).toHaveBeenCalledOnce();
    expect(h.onStart).not.toHaveBeenCalled();
  });

  it("does nothing on Space from the analysis view", () => {
    const h = makeHandlers({ view: "analysis" });
    renderHook(() => useShortcuts(h));
    press("Space");
    expect(h.onStart).not.toHaveBeenCalled();
    expect(h.onStop).not.toHaveBeenCalled();
  });

  it("ignores Space while the recorder is busy in setup", () => {
    const h = makeHandlers({ recorderBusy: true });
    renderHook(() => useShortcuts(h));
    press("Space");
    expect(h.onStart).not.toHaveBeenCalled();
  });

  it("triggers retake on R only from the analysis view", () => {
    const setup = makeHandlers({ view: "setup" });
    const recording = makeHandlers({ view: "recording" });
    const analysis = makeHandlers({ view: "analysis" });
    renderHook(() => useShortcuts(setup));
    renderHook(() => useShortcuts(recording));
    renderHook(() => useShortcuts(analysis));
    press("KeyR");
    expect(setup.onRetake).not.toHaveBeenCalled();
    expect(recording.onRetake).not.toHaveBeenCalled();
    expect(analysis.onRetake).toHaveBeenCalledOnce();
  });

  it("ignores shortcuts when typing in an input", () => {
    const h = makeHandlers();
    renderHook(() => useShortcuts(h));
    const input = document.createElement("input");
    document.body.appendChild(input);
    press("Space", input);
    expect(h.onStart).not.toHaveBeenCalled();
    input.remove();
  });

  it("ignores shortcuts when typing in a textarea", () => {
    const h = makeHandlers();
    renderHook(() => useShortcuts(h));
    const ta = document.createElement("textarea");
    document.body.appendChild(ta);
    press("Space", ta);
    expect(h.onStart).not.toHaveBeenCalled();
    ta.remove();
  });

  it("ignores shortcuts in contentEditable regions", () => {
    const h = makeHandlers();
    renderHook(() => useShortcuts(h));
    const div = document.createElement("div");
    // jsdom doesn't auto-derive isContentEditable from the attribute, so set
    // both explicitly.
    div.setAttribute("contenteditable", "true");
    Object.defineProperty(div, "isContentEditable", { value: true });
    document.body.appendChild(div);
    press("Space", div);
    expect(h.onStart).not.toHaveBeenCalled();
    div.remove();
  });

  it("ignores shortcuts when modifiers are held", () => {
    const h = makeHandlers();
    renderHook(() => useShortcuts(h));
    press("Space", document.body, { metaKey: true });
    press("Space", document.body, { ctrlKey: true });
    press("Space", document.body, { altKey: true });
    expect(h.onStart).not.toHaveBeenCalled();
  });

  it("calls preventDefault when handling a shortcut", () => {
    const h = makeHandlers();
    renderHook(() => useShortcuts(h));
    const event = press("Space");
    expect(event.defaultPrevented).toBe(true);
  });

  it("uses the latest handler refs after props change", () => {
    const first = makeHandlers();
    const second = makeHandlers();
    const { rerender } = renderHook(({ h }) => useShortcuts(h), {
      initialProps: { h: first },
    });
    rerender({ h: second });
    press("Space");
    expect(first.onStart).not.toHaveBeenCalled();
    expect(second.onStart).toHaveBeenCalledOnce();
  });
});
