"use client";

import { useEffect, useRef } from "react";
import type { TranscribeResponse, TranscribeSegment } from "@/lib/transcription";
import { formatElapsed } from "@/lib/recorder";

type Tier = "high" | "medium" | "low" | "silent";

export function confidenceTier(s: TranscribeSegment): Tier {
  if ((s.noSpeechProb ?? 0) > 0.6) return "silent";
  const lp = s.avgLogprob ?? 0;
  if (lp < -1.0) return "low";
  if (lp < -0.6) return "medium";
  return "high";
}

export function summarize(segments: TranscribeSegment[]) {
  let medium = 0;
  let low = 0;
  let silent = 0;
  for (const s of segments) {
    const t = confidenceTier(s);
    if (t === "medium") medium++;
    else if (t === "low") low++;
    else if (t === "silent") silent++;
  }
  return { total: segments.length, medium, low, silent };
}

export function Transcript({
  transcript,
  currentTime,
  onSeek,
}: {
  transcript: TranscribeResponse | null;
  currentTime?: number;
  onSeek?: (sec: number) => void;
}) {
  if (!transcript) return null;
  const segs = transcript.segments;
  const sum = summarize(segs);
  const flagged = sum.medium + sum.low + sum.silent;
  const hasConfidence = segs.some(
    (s) => s.avgLogprob != null || s.noSpeechProb != null,
  );
  const sourceLabel =
    segs[0]?.source === "cloud"
      ? "whisper-large-v3-turbo (Groq)"
      : "distil-medium.en (on-device)";
  const clickable = Boolean(onSeek);

  return (
    <section>
      <div className="kicker text-[var(--color-brass)]">Transcript</div>
      <h3 className="text-2xl font-semibold tracking-tight mt-1 mb-2 text-[var(--color-paper)]">
        Transcript
      </h3>
      <div className="text-[13px] text-[var(--color-paper-2)] mb-4 leading-snug">
        {sum.total} segment{sum.total === 1 ? "" : "s"} from{" "}
        <span className="font-mono text-[var(--color-paper)]">{sourceLabel}</span>
        {hasConfidence && flagged > 0 ? (
          <>
            {" · "}
            <span className="text-[var(--color-paper)]">{flagged}</span> flagged as low confidence
            {sum.silent > 0 ? (
              <>
                {" "}
                <span className="text-[var(--color-paper-3)]">
                  ({sum.silent} likely silence)
                </span>
              </>
            ) : null}
          </>
        ) : null}
        {clickable ? (
          <>
            {" · "}
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)]">
              click to jump
            </span>
          </>
        ) : null}
      </div>

      {hasConfidence ? <Legend /> : null}

      <ol className="mt-4 space-y-1.5 max-h-[480px] overflow-y-auto pr-2">
        {segs.map((s, i) => (
          <SegmentRow
            key={i}
            s={s}
            showConfidence={hasConfidence}
            currentTime={currentTime}
            onSeek={onSeek}
          />
        ))}
      </ol>

      {hasConfidence && flagged > 0 ? (
        <div className="mt-4 text-[12px] text-[var(--color-paper-3)] leading-snug max-w-[60ch]">
          Flagged segments had low log-probability from the model. Re-transcribing
          just those clips through a stronger model is the next step if accuracy
          isn’t good enough.
        </div>
      ) : null}
    </section>
  );
}

function SegmentRow({
  s,
  showConfidence,
  currentTime,
  onSeek,
}: {
  s: TranscribeSegment;
  showConfidence: boolean;
  currentTime?: number;
  onSeek?: (sec: number) => void;
}) {
  const liRef = useRef<HTMLLIElement>(null);
  const tier = showConfidence ? confidenceTier(s) : "high";
  const text = s.text.trim();
  const isSilent = tier === "silent";
  const isActive =
    currentTime != null && currentTime >= s.start && currentTime < s.end;

  // Auto-scroll the active row into view as playback advances.
  useEffect(() => {
    if (isActive && liRef.current) {
      liRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isActive]);

  const decoration =
    tier === "low"
      ? "underline decoration-dotted decoration-2 decoration-[var(--color-oxblood)] underline-offset-4"
      : tier === "medium"
        ? "underline decoration-dotted decoration-[var(--color-brass)] underline-offset-4"
        : "";

  const textColor = isSilent
    ? "text-[var(--color-paper-3)] line-through"
    : "text-[var(--color-paper)]";

  const lp = s.avgLogprob;
  const np = s.noSpeechProb;
  const tip = [
    lp != null ? `avg_logprob ${lp.toFixed(2)}` : null,
    np != null ? `no_speech_prob ${np.toFixed(2)}` : null,
    onSeek ? `click to jump to ${formatElapsed(Math.floor(s.start))}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleClick = onSeek ? () => onSeek(s.start) : undefined;
  const handleKey = onSeek
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSeek(s.start);
        }
      }
    : undefined;

  const baseClass = "flex gap-3 text-[14px] leading-[1.55] transition-colors";
  const seekClass = onSeek
    ? `cursor-pointer pl-2 -ml-2 pr-2 rounded-sm ${
        isActive
          ? "bg-[var(--color-ink-2)]/80 border-l-2 border-[var(--color-brass)]"
          : "hover:bg-[var(--color-ink-1)]"
      }`
    : "";

  return (
    <li
      ref={liRef}
      className={`${baseClass} ${seekClass}`}
      title={tip}
      onClick={handleClick}
      onKeyDown={handleKey}
      role={onSeek ? "button" : undefined}
      tabIndex={onSeek ? 0 : undefined}
    >
      <span
        className={`font-mono tnum text-[12px] pt-1 shrink-0 w-12 text-right ${
          isActive
            ? "text-[var(--color-brass)] font-semibold"
            : "text-[var(--color-paper-3)]"
        }`}
      >
        {formatElapsed(Math.floor(s.start))}
      </span>
      <span className={`${textColor} ${decoration}`}>{text || "—"}</span>
    </li>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-paper-3)]">
      <LegendChip color="paper" label="High" />
      <LegendChip color="brass" label="Medium · logprob &lt; −0.6" />
      <LegendChip color="oxblood" label="Low · logprob &lt; −1.0" />
      <LegendChip color="strike" label="Likely silence" />
    </div>
  );
}

function LegendChip({
  color,
  label,
}: {
  color: "paper" | "brass" | "oxblood" | "strike";
  label: React.ReactNode;
}) {
  const sample =
    color === "paper" ? (
      <span className="text-[var(--color-paper)]">abc</span>
    ) : color === "brass" ? (
      <span className="underline decoration-dotted decoration-[var(--color-brass)] underline-offset-4 text-[var(--color-paper)]">
        abc
      </span>
    ) : color === "oxblood" ? (
      <span className="underline decoration-dotted decoration-2 decoration-[var(--color-oxblood)] underline-offset-4 text-[var(--color-paper)]">
        abc
      </span>
    ) : (
      <span className="line-through text-[var(--color-paper-3)]">abc</span>
    );
  return (
    <span className="flex items-center gap-2">
      <span className="text-[12px] normal-case tracking-normal">{sample}</span>
      <span>{label}</span>
    </span>
  );
}
