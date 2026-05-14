"use client";

import { useEffect, useRef } from "react";

type View = "setup" | "recording" | "analysis";

type Handlers = {
  view: View;
  recorderBusy: boolean;
  onStart: () => void;
  onStop: () => void;
  onRetake: () => void;
};

/** Space = start/stop, R = retake. Suppressed when typing in a form field.
 *  Uses the event-handler-ref pattern so the listener is attached once. */
export function useShortcuts(h: Handlers) {
  const ref = useRef(h);
  useEffect(() => {
    ref.current = h;
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.matches("input, textarea, select") ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const { view, recorderBusy, onStart, onStop, onRetake } = ref.current;
      if (e.code === "Space") {
        if (view === "setup" && !recorderBusy) {
          e.preventDefault();
          onStart();
        } else if (view === "recording") {
          e.preventDefault();
          onStop();
        }
      } else if (e.code === "KeyR" && view === "analysis") {
        e.preventDefault();
        onRetake();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
