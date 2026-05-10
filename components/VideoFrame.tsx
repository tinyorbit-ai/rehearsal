"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function VideoFrame({
  state,
  stream,
  caption,
  timer,
  notice,
}: {
  state: "setup" | "recording";
  stream?: MediaStream | null;
  caption?: ReactNode;
  timer?: string;
  /** Bottom-left chrome line — e.g. permissions or model load status. */
  notice?: ReactNode;
}) {
  const recording = state === "recording";
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative aspect-video w-full overflow-hidden border border-[var(--color-ink-2)] bg-[var(--color-ink-1)]">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
      ) : (
        <>
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(135deg, rgba(251,250,247,0.02) 0 1px, transparent 1px 18px)",
            }}
          />
          {/* silhouette */}
          <svg
            aria-hidden
            viewBox="0 0 400 225"
            className="absolute inset-0 w-full h-full opacity-20"
            preserveAspectRatio="xMidYMid slice"
          >
            <ellipse cx="200" cy="95" rx="34" ry="42" fill="currentColor" />
            <path
              d="M120 230 C 120 160, 280 160, 280 230 Z"
              fill="currentColor"
            />
          </svg>
        </>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-4">
        <div className="flex items-center gap-2">
          {recording ? (
            <span className="flex items-center gap-2 px-2 py-1 bg-[var(--color-hazard)] text-[var(--color-ink-0)] font-mono text-[10px] tracking-[0.22em] uppercase font-semibold">
              <span className="rec-dot inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-ink-0)]" />
              Rec
            </span>
          ) : (
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[var(--color-paper-3)] bg-[var(--color-ink-0)]/60 px-2 py-1">
              {stream ? "Preview" : "Camera off"}
            </span>
          )}
        </div>
        {recording && timer ? (
          <span className="font-mono tnum text-[13px] tracking-[0.1em] text-[var(--color-paper)] bg-[var(--color-ink-0)]/80 px-2 py-1">
            {timer}
          </span>
        ) : null}
      </div>

      {/* Captions */}
      {recording ? (
        <div className="absolute left-0 right-0 bottom-0 bg-[var(--color-ink-0)] border-t border-[var(--color-ink-2)] p-5">
          <div className="kicker mb-2 text-[var(--color-brass)]">
            Live caption
          </div>
          <div className="text-[clamp(20px,2.4vw,28px)] font-medium leading-[1.3] max-w-[68ch] min-h-[1.4em]">
            {caption || (
              <span className="text-[var(--color-paper-3)]">
                Listening…
              </span>
            )}
          </div>
        </div>
      ) : !stream ? (
        <div className="absolute inset-x-0 bottom-0 p-6 text-center">
          <div className="text-[var(--color-paper)] text-lg font-medium">
            Camera is off
          </div>
          <div className="mt-1 text-sm text-[var(--color-paper-2)]">
            Press start to grant camera + microphone access.
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="absolute bottom-2 left-3 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)] bg-[var(--color-ink-0)]/80 px-2 py-1 z-10">
          {notice}
        </div>
      ) : null}
    </div>
  );
}
