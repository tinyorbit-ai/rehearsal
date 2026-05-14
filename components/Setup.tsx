"use client";

import { VideoFrame } from "./VideoFrame";
import { Vitals } from "./Vitals";
import { Preparation } from "./Preparation";
import { AudioMeter } from "./AudioMeter";
import type { Prep } from "./Preparation";
import type { RecorderState } from "@/lib/recorder";
import { useAudioLevel } from "@/lib/use-audio-level";

export function Setup({
  recorderState,
  recorderError,
  stream,
  prep,
  onPrepChange,
  onStart,
  onUpload,
}: {
  recorderState: RecorderState;
  recorderError: string | null;
  stream: MediaStream | null;
  prep: Prep;
  onPrepChange: (next: Prep) => void;
  onStart: () => void;
  onUpload: (file: File) => void;
}) {
  const requesting = recorderState === "requesting";
  const denied = recorderState === "denied";
  const rms = useAudioLevel(stream);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onUpload(file);
  }

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
            <div className="mt-3 flex items-center justify-between gap-3 font-mono text-[10px] text-[var(--color-paper-3)] uppercase tracking-[0.22em]">
              <span>Frame · 16:9 · mirrored</span>
              {stream ? (
                <AudioMeter rms={rms} />
              ) : (
                <span>Click start to grant camera + mic</span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <label className="inline-flex items-center gap-2 cursor-pointer border border-[var(--color-ink-2)] px-3 py-2 hover:border-[var(--color-brass)] transition group">
                <span className="text-[var(--color-paper-2)] group-hover:text-[var(--color-brass)] transition font-semibold">↑</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper)] font-semibold">
                  Upload a video instead
                </span>
                <input
                  type="file"
                  accept="video/*"
                  className="sr-only"
                  onChange={handlePick}
                />
              </label>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)]">
                .mp4 · .webm · .mov — analysed the same way
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
