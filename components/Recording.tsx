"use client";

import { VideoFrame } from "./VideoFrame";
import { Vitals } from "./Vitals";
import type { StatsSnapshot } from "@/lib/stats";
import type { ModelStatus } from "@/lib/transcription";

export function Recording({
  stream,
  caption,
  timer,
  modelStatus,
  modelBackend,
  loadProgress,
  loadFile,
  transcriptionError,
  currentRms,
  stats,
  lastUpdateAgoSec,
  onStop,
}: {
  stream: MediaStream | null;
  caption: string;
  timer: string;
  modelStatus: ModelStatus;
  modelBackend: "webgpu" | "wasm" | null;
  loadProgress: number;
  loadFile: string | null;
  transcriptionError: string | null;
  currentRms: number;
  stats: StatsSnapshot;
  lastUpdateAgoSec: number;
  onStop: () => void;
}) {
  const modelLine =
    modelStatus === "loading"
      ? `Loading whisper-tiny${loadFile ? ` · ${loadFile}` : ""}${loadProgress ? ` · ${loadProgress.toFixed(0)}%` : ""}`
      : modelStatus === "ready"
        ? `Listening · whisper-tiny on ${modelBackend ?? "wasm"}`
        : modelStatus === "error"
          ? "Transcription unavailable"
          : "Initializing…";

  // Effective caption to render: error message if model failed, model
  // status while still loading, otherwise the live caption text.
  const captionContent =
    modelStatus === "error" && transcriptionError ? (
      <span className="text-[var(--color-oxblood)]">
        Transcription error — {transcriptionError}
      </span>
    ) : modelStatus !== "ready" ? (
      <span className="text-[var(--color-paper-3)]">
        {modelStatus === "loading"
          ? `Loading speech model… ${loadFile ?? ""}${loadProgress ? ` ${loadProgress.toFixed(0)}%` : ""}`
          : "Initializing…"}
      </span>
    ) : (
      caption || (
        <span className="text-[var(--color-paper-3)]">Listening…</span>
      )
    );

  return (
    <section className="mx-auto max-w-[1240px] px-6 py-8">
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="reveal reveal-2">
          <VideoFrame
            state="recording"
            stream={stream}
            timer={timer}
            caption={captionContent}
          />
          <div className="mt-3 flex items-center justify-between gap-3 font-mono text-[10px] text-[var(--color-paper-3)] uppercase tracking-[0.22em]">
            <span className="flex items-center gap-2 min-w-0">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  modelStatus === "error"
                    ? "bg-[var(--color-oxblood)]"
                    : "rec-dot bg-[var(--color-hazard)]"
                }`}
              />
              <span className="truncate">{modelLine}</span>
            </span>
            <AudioMeter rms={currentRms} />
          </div>
        </div>
        <div className="reveal reveal-3">
          <Vitals
            mode="live"
            stats={stats}
            elapsed={timer}
            lastUpdateAgoSec={lastUpdateAgoSec}
            onStop={onStop}
          />
        </div>
      </div>

      <div className="mt-8 reveal reveal-4 border-t border-[var(--color-ink-2)] pt-6">
        <div className="grid gap-6 md:grid-cols-3 text-sm">
          <Tip
            kicker="Pacing"
            body="Aim for 130–150 wpm. If pace turns red, breathe and slow down for the next sentence."
          />
          <Tip
            kicker="Fillers"
            body="A small one-beat pause reads as composure. Three ‘ums’ in a row reads as hedging."
          />
          <Tip
            kicker="Structure"
            body="Situation → task → action → result. Save the result for the last 20 seconds."
          />
        </div>
      </div>
    </section>
  );
}

function AudioMeter({ rms }: { rms: number }) {
  // Map RMS (typically 0–0.3 for speech) to a 0–1 fill, then clamp.
  const level = Math.min(1, Math.max(0, rms / 0.25));
  const bars = 12;
  const lit = Math.round(level * bars);
  return (
    <span className="flex items-center gap-2 shrink-0">
      <span>Mic</span>
      <span className="flex items-end gap-[2px] h-3">
        {Array.from({ length: bars }, (_, i) => {
          const isLit = i < lit;
          const color =
            i < bars * 0.5
              ? "var(--color-brass)"
              : i < bars * 0.85
                ? "var(--color-paper)"
                : "var(--color-oxblood)";
          return (
            <span
              key={i}
              className="w-[3px] rounded-[1px]"
              style={{
                height: `${30 + i * 6}%`,
                background: isLit ? color : "var(--color-ink-2)",
                transition: "background 80ms linear",
              }}
            />
          );
        })}
      </span>
    </span>
  );
}

function Tip({ kicker, body }: { kicker: string; body: string }) {
  return (
    <div>
      <div className="kicker text-[var(--color-brass)]">{kicker}</div>
      <p className="mt-1.5 text-[14px] leading-[1.5] text-[var(--color-paper)]">
        {body}
      </p>
    </div>
  );
}
