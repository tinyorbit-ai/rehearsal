"use client";

import type { ReactNode } from "react";
import type { StatsSnapshot, Tone } from "@/lib/stats";
import { EMPTY_STATS } from "@/lib/stats";

const toneClass: Record<Tone, string> = {
  good: "text-[var(--color-brass)]",
  watch: "text-[var(--color-paper)]",
  warn: "text-[var(--color-oxblood)]",
};

function Stat({
  label,
  value,
  unit,
  trend,
  tone = "watch",
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  trend?: string;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="py-3 border-b border-[var(--color-ink-2)] last:border-b-0">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)]">
        <span>{label}</span>
        {trend ? <span className="tnum">{trend}</span> : null}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`font-mono tnum text-3xl font-semibold tape ${toneClass[tone]}`}>
          {value}
        </span>
        {unit ? (
          <span className="text-xs text-[var(--color-paper-3)] uppercase tracking-wider">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-[var(--color-paper-3)]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function fmtTrend(n: number, suffix = ""): string | undefined {
  if (n === 0) return undefined;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}${suffix}`;
}

export function Vitals({
  mode,
  stats = EMPTY_STATS,
  elapsed,
  lastUpdateAgoSec,
  canStart,
  busy,
  onStart,
  onStop,
}: {
  mode: "idle" | "live";
  stats?: StatsSnapshot;
  /** mm:ss timer to show during recording */
  elapsed?: string;
  lastUpdateAgoSec?: number;
  canStart?: boolean;
  busy?: boolean;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const live = mode === "live";

  return (
    <aside className="bg-[var(--color-ink-1)] border border-[var(--color-ink-2)] p-5 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-paper)]">
          Vitals
        </h2>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.22em] font-semibold ${
            live ? "text-[var(--color-hazard)]" : "text-[var(--color-paper-3)]"
          }`}
        >
          {live ? "● Live" : "Idle"}
        </span>
      </div>

      {live && elapsed ? (
        <div className="mt-3 mb-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)]">
            Elapsed
          </div>
          <div className="font-mono tnum text-2xl font-semibold mt-0.5">
            {elapsed}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-col">
        <Stat
          label="Pace"
          value={live && stats.wpm ? stats.wpm : "—"}
          unit="wpm"
          trend={live ? fmtTrend(stats.paceTrend) : undefined}
          tone={live ? stats.paceTone : "watch"}
          hint={live ? "median 30s window" : "awaiting input"}
        />
        <Stat
          label="Fillers"
          value={live && stats.takenAt ? stats.fillerPct.toFixed(1) : "—"}
          unit="%"
          trend={live ? fmtTrend(stats.fillerTrend) : undefined}
          tone={live ? stats.fillerTone : "watch"}
          hint={live ? "um · uh · like · you know" : "—"}
        />
        <Stat
          label="Long pauses"
          value={live && stats.takenAt ? stats.longPauses : "—"}
          unit="count"
          tone={live ? stats.pauseTone : "watch"}
          hint={
            live && stats.longestPauseSec
              ? `longest ${stats.longestPauseSec.toFixed(1)}s`
              : "—"
          }
        />
        <Stat
          label="Volatility"
          value={live && stats.takenAt ? stats.volatility : "—"}
          tone={live ? stats.volatilityTone : "watch"}
          hint={live ? "pace standard deviation" : "—"}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-[var(--color-ink-2)] font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)]">
        {live ? (
          stats.takenAt ? (
            <>
              <span className="tnum">{lastUpdateAgoSec ?? 0}s</span> since last
              update · refreshes every 10s
            </>
          ) : (
            "Warming up · first stats in ~6s"
          )
        ) : (
          "Stats refresh every 10 seconds while recording."
        )}
      </div>

      <div className="grow" />

      <div className="mt-6">
        {live ? (
          <button
            onClick={onStop}
            className="w-full py-3 font-mono uppercase tracking-[0.22em] text-sm font-semibold bg-[var(--color-oxblood)] text-[var(--color-paper)] hover:brightness-110 transition disabled:opacity-50"
            disabled={busy}
          >
            ■ Stop recording
          </button>
        ) : (
          <button
            onClick={onStart}
            className="w-full py-3 font-mono uppercase tracking-[0.22em] text-sm font-semibold bg-[var(--color-hazard)] text-[var(--color-ink-0)] hover:brightness-110 transition disabled:opacity-50"
            disabled={!canStart || busy}
          >
            {busy ? "● Requesting access…" : "◉ Start recording"}
          </button>
        )}
        <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)] text-center">
          {live ? "Max 30:00 total" : "Camera + mic access required"}
        </div>
      </div>
    </aside>
  );
}
