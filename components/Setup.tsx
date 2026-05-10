"use client";

import { VideoFrame } from "./VideoFrame";
import { Vitals } from "./Vitals";
import { Preparation } from "./Preparation";
import type { Prep } from "./Preparation";
import type { RecorderState } from "@/lib/recorder";

export function Setup({
  recorderState,
  recorderError,
  stream,
  prep,
  onPrepChange,
  onStart,
}: {
  recorderState: RecorderState;
  recorderError: string | null;
  stream: MediaStream | null;
  prep: Prep;
  onPrepChange: (next: Prep) => void;
  onStart: () => void;
}) {
  const requesting = recorderState === "requesting";
  const denied = recorderState === "denied";

  return (
    <>
      <section className="mx-auto max-w-[1240px] px-6 py-8">
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="reveal reveal-2">
            <VideoFrame
              state="setup"
              stream={stream}
              notice={
                denied && recorderError ? (
                  <span className="text-[var(--color-oxblood)]">
                    {recorderError}
                  </span>
                ) : stream ? (
                  "Preview · only you see this"
                ) : null
              }
            />
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-[var(--color-paper-3)] uppercase tracking-[0.22em]">
              <span>Frame · 16:9 · mirrored</span>
              <span>
                {stream
                  ? "Camera ready"
                  : "Click start to grant camera + mic"}
              </span>
            </div>
          </div>
          <div className="reveal reveal-3">
            <Vitals
              mode="idle"
              canStart={!requesting}
              busy={requesting}
              onStart={onStart}
            />
          </div>
        </div>
      </section>

      <div className="reveal reveal-4">
        <Preparation value={prep} onChange={onPrepChange} />
      </div>
    </>
  );
}
