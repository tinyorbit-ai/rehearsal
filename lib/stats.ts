"use client";

import { useEffect, useRef, useState } from "react";
import type { LocalWindow } from "./transcription";

export type Tone = "good" | "watch" | "warn";
export type VolatilityLevel = "low" | "medium" | "high";

export type StatsSnapshot = {
  wpm: number;
  paceTone: Tone;
  paceTrend: number; // wpm delta from previous snapshot
  fillerPct: number;
  fillerTone: Tone;
  fillerTrend: number;
  longPauses: number;
  longestPauseSec: number;
  pauseTone: Tone;
  volatility: VolatilityLevel;
  volatilityTone: Tone;
  /** unix ms */
  takenAt: number;
};

export const EMPTY_STATS: StatsSnapshot = {
  wpm: 0,
  paceTone: "watch",
  paceTrend: 0,
  fillerPct: 0,
  fillerTone: "watch",
  fillerTrend: 0,
  longPauses: 0,
  longestPauseSec: 0,
  pauseTone: "good",
  volatility: "low",
  volatilityTone: "good",
  takenAt: 0,
};

const FILLER_PATTERNS: RegExp[] = [
  /\bum+\b/gi,
  /\buh+\b/gi,
  /\bumm+\b/gi,
  /\bahh+\b/gi,
  /\blike\b/gi,
  /\bbasically\b/gi,
  /\bliterally\b/gi,
  /\bactually\b/gi,
  /\byou know\b/gi,
  /\bi mean\b/gi,
  /\bkind of\b/gi,
  /\bsort of\b/gi,
];

export function countWords(text: string): number {
  const m = text.trim().match(/\b[\w']+\b/g);
  return m ? m.length : 0;
}

export function countFillers(text: string): number {
  let n = 0;
  for (const re of FILLER_PATTERNS) {
    const m = text.match(re);
    if (m) n += m.length;
  }
  return n;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function paceTone(wpm: number): Tone {
  if (wpm === 0) return "watch";
  if (wpm >= 130 && wpm <= 160) return "good";
  if (wpm >= 110 && wpm < 130) return "watch";
  if (wpm > 160 && wpm <= 180) return "watch";
  return "warn";
}

function fillerTone(pct: number): Tone {
  if (pct < 2.5) return "good";
  if (pct < 5) return "watch";
  return "warn";
}

function pauseTone(count: number, longest: number): Tone {
  if (count === 0) return "good";
  if (longest > 5) return "warn";
  if (count <= 2) return "watch";
  return "warn";
}

function classifyVolatility(s: number): { level: VolatilityLevel; tone: Tone } {
  // s is stdev of words-per-second across recent windows
  if (s < 0.45) return { level: "low", tone: "good" };
  if (s < 0.85) return { level: "medium", tone: "watch" };
  return { level: "high", tone: "warn" };
}

export function findLongPauses(
  rmsSamples: { t: number; rms: number }[],
  threshold = 0.012,
  minPauseSec = 2,
): { count: number; longest: number } {
  if (rmsSamples.length < 2) return { count: 0, longest: 0 };
  let count = 0;
  let longest = 0;
  let runStart: number | null = null;
  for (let i = 0; i < rmsSamples.length; i++) {
    const s = rmsSamples[i];
    if (s.rms < threshold) {
      if (runStart === null) runStart = s.t;
    } else if (runStart !== null) {
      const dur = s.t - runStart;
      if (dur >= minPauseSec) {
        count++;
        if (dur > longest) longest = dur;
      }
      runStart = null;
    }
  }
  // tail run
  if (runStart !== null) {
    const last = rmsSamples[rmsSamples.length - 1];
    const dur = last.t - runStart;
    if (dur >= minPauseSec) {
      count++;
      if (dur > longest) longest = dur;
    }
  }
  return { count, longest: Math.round(longest * 10) / 10 };
}

export function computeStats({
  localWindows,
  rmsSamples,
  elapsedSec,
  rollingSec = 30,
  prev,
}: {
  localWindows: LocalWindow[];
  rmsSamples: { t: number; rms: number }[];
  elapsedSec: number;
  rollingSec?: number;
  prev?: StatsSnapshot;
}): StatsSnapshot {
  const cutoff = elapsedSec - rollingSec;
  const recent = localWindows.filter((w) => w.t >= cutoff);

  const wpsValues = recent
    .map((w) => countWords(w.text) / Math.max(0.1, w.durationSec))
    .filter((v) => Number.isFinite(v));
  const wpm = wpsValues.length ? Math.round(mean(wpsValues) * 60) : 0;

  const totalWords = recent.reduce((s, w) => s + countWords(w.text), 0);
  const fillerWords = recent.reduce((s, w) => s + countFillers(w.text), 0);
  const fillerPct = totalWords ? (fillerWords / totalWords) * 100 : 0;

  const pauseInfo = findLongPauses(rmsSamples);
  const vol = classifyVolatility(stdev(wpsValues));

  return {
    wpm,
    paceTone: paceTone(wpm),
    paceTrend: prev ? wpm - prev.wpm : 0,
    fillerPct: Math.round(fillerPct * 10) / 10,
    fillerTone: fillerTone(fillerPct),
    fillerTrend: prev ? Math.round((fillerPct - prev.fillerPct) * 10) / 10 : 0,
    longPauses: pauseInfo.count,
    longestPauseSec: pauseInfo.longest,
    pauseTone: pauseTone(pauseInfo.count, pauseInfo.longest),
    volatility: vol.level,
    volatilityTone: vol.tone,
    takenAt: Date.now(),
  };
}

export function useStats({
  localWindows,
  rmsSamples,
  elapsedSec,
  active,
  /** ms between recompute ticks; default 10s. */
  intervalMs = 10_000,
  /** seconds to look back over. */
  rollingSec = 30,
  /** ms before first tick — gives the user a brief warmup. */
  warmupMs = 6_000,
}: {
  localWindows: LocalWindow[];
  rmsSamples: { t: number; rms: number }[];
  elapsedSec: number;
  active: boolean;
  intervalMs?: number;
  rollingSec?: number;
  warmupMs?: number;
}): { snapshot: StatsSnapshot; lastUpdateAgoSec: number } {
  const [snapshot, setSnapshot] = useState<StatsSnapshot>(EMPTY_STATS);
  const [now, setNow] = useState(0);

  // Mirror inputs in refs so the interval callback always sees fresh values.
  const winRef = useRef(localWindows);
  const rmsRef = useRef(rmsSamples);
  const elapsedRef = useRef(elapsedSec);
  const prevRef = useRef<StatsSnapshot | undefined>(undefined);

  // Update refs in an effect (React 19 disallows mutating refs during render).
  useEffect(() => {
    winRef.current = localWindows;
    rmsRef.current = rmsSamples;
    elapsedRef.current = elapsedSec;
  }, [localWindows, rmsSamples, elapsedSec]);

  useEffect(() => {
    if (!active) {
      prevRef.current = undefined;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSnapshot(EMPTY_STATS);
      return;
    }
    const tick = () => {
      const next = computeStats({
        localWindows: winRef.current,
        rmsSamples: rmsRef.current,
        elapsedSec: elapsedRef.current,
        rollingSec,
        prev: prevRef.current,
      });
      prevRef.current = next;
      setSnapshot(next);
    };

    const initial = setTimeout(tick, warmupMs);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [active, intervalMs, rollingSec, warmupMs]);

  // 1Hz "now" tick so lastUpdateAgoSec ticks visibly. setNow inside an interval
  // callback is fine — it's not a synchronous setState during the effect body.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const lastUpdateAgoSec =
    snapshot.takenAt && now ? Math.max(0, Math.floor((now - snapshot.takenAt) / 1000)) : 0;

  return { snapshot, lastUpdateAgoSec };
}
