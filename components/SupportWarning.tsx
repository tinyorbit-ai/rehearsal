"use client";

import { useEffect, useState } from "react";
import type { SupportReport } from "@/lib/browser-support";

const DISMISS_KEY = "rehearsal.support-dismissed.v1";

export function SupportWarning({ report }: { report: SupportReport }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // localStorage isn't safe to read during render (SSR hydration); read
    // on mount and reconcile.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  const fatal = !report.canRun;
  const slow = report.slowFallback;
  if (!fatal && !slow) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="border-b"
      style={{
        background: fatal ? "rgba(224, 57, 44, 0.08)" : "rgba(229, 200, 112, 0.06)",
        borderColor: fatal ? "var(--color-oxblood)" : "var(--color-brass)",
      }}
    >
      <div className="mx-auto max-w-[1240px] px-6 py-2.5 flex items-center gap-3">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.22em] shrink-0"
          style={{
            color: fatal ? "var(--color-oxblood)" : "var(--color-brass)",
          }}
        >
          {fatal ? "Unsupported" : "Heads up"}
        </span>
        <span className="text-[13px] text-[var(--color-paper)] flex-1 min-w-0">
          {fatal
            ? buildFatalMessage(report)
            : "WebGPU isn’t available — speech transcription will run on WASM (≈3× slower than WebGPU). For best results, use Chrome or Edge."}
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)] hover:text-[var(--color-paper)] transition shrink-0"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function buildFatalMessage(r: SupportReport): string {
  const missing: string[] = [];
  if (!r.getUserMedia) missing.push("camera/microphone access");
  if (!r.mediaRecorder) missing.push("MediaRecorder");
  if (!r.audioWorklet) missing.push("AudioWorklet");
  return `This browser is missing ${missing.join(" + ")}. Try the latest Chrome, Edge, or Firefox on desktop.`;
}
