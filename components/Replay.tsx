"use client";

import { useRef, useState } from "react";
import type { TranscribeResponse } from "@/lib/transcription";
import { Transcript } from "./Transcript";

export function Replay({
  videoUrl,
  transcript,
}: {
  videoUrl: string | null;
  transcript: TranscribeResponse;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  function seekTo(sec: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, sec);
    if (v.paused) v.play().catch(() => {});
  }

  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="md:sticky md:top-4 self-start">
        <div className="aspect-video w-full overflow-hidden border border-[var(--color-ink-2)] bg-[var(--color-ink-1)]">
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="w-full h-full object-cover"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--color-paper-3)] text-sm">
              No video available
            </div>
          )}
        </div>
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)]">
          Replay · click a transcript line to jump
        </div>
      </div>

      <div className="min-w-0">
        <Transcript
          transcript={transcript}
          currentTime={currentTime}
          onSeek={seekTo}
        />
      </div>
    </section>
  );
}
