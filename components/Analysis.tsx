"use client";

import { useState } from "react";
import type { Feedback } from "@/lib/feedback-schema";
import type { TranscribeResponse } from "@/lib/transcription";
import type { StatsSnapshot } from "@/lib/stats";
import { formatElapsed } from "@/lib/recorder";
import { countWords } from "@/lib/stats";
import { Transcript, confidenceTier } from "./Transcript";
import { Replay } from "./Replay";
import type { RehearsalKind } from "./Preparation";

export type AnalysisStatus =
  | "transcribing"
  | "analyzing"
  | "ready"
  | "error";

export function Analysis({
  status,
  error,
  videoUrl,
  audioUrl,
  videoMime,
  audioMime,
  durationSec,
  feedback,
  modelLabel,
  generatedAt,
  stats,
  transcript,
  rehearsalKind,
  contextProvided,
  onRetake,
  onCopyMarkdown,
}: {
  status: AnalysisStatus;
  error: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  videoMime: string | null;
  audioMime: string | null;
  durationSec: number;
  feedback: Feedback | null;
  modelLabel: string | null;
  generatedAt: string | null;
  stats: StatsSnapshot;
  transcript: TranscribeResponse | null;
  rehearsalKind: RehearsalKind;
  contextProvided: boolean;
  onRetake: () => void;
  onCopyMarkdown: () => void;
}) {
  const wordCount = transcript ? countWords(transcript.text) : 0;
  const ext = (mime: string | null) =>
    !mime ? "bin" : mime.includes("mp4") ? "mp4" : "webm";

  const [bundleBusy, setBundleBusy] = useState(false);
  async function handleDownloadBundle() {
    if (!feedback || !transcript || !videoUrl) return;
    setBundleBusy(true);
    try {
      await downloadSelfContainedHtml({
        videoUrl,
        videoMime,
        feedback,
        transcript,
        stats,
        durationSec,
        wordCount,
        modelLabel,
        generatedAt,
        rehearsalKind,
        contextProvided,
      });
    } catch (err) {
      console.error("Bundle download failed", err);
      alert(`Bundle download failed: ${(err as Error).message}`);
    } finally {
      setBundleBusy(false);
    }
  }

  return (
    <article className="mx-auto max-w-[1240px] px-6 py-10">
      {/* Top — downloads + meta */}
      <div className="flex flex-wrap items-center justify-between gap-3 reveal reveal-1">
        <div className="flex items-center gap-2 flex-wrap">
          <DownloadChip
            label="video"
            sub={`.${ext(videoMime)}`}
            href={videoUrl}
            filename={`rehearsal-video.${ext(videoMime)}`}
          />
          {audioUrl ? (
            <DownloadChip
              label="audio"
              sub={`.${ext(audioMime)}`}
              href={audioUrl}
              filename={`rehearsal-audio.${ext(audioMime)}`}
            />
          ) : null}
          <DownloadChip
            label="transcript"
            sub=".md"
            disabled={!transcript}
            onClick={() => downloadMarkdown(transcript)}
          />
          <DownloadChip
            label={bundleBusy ? "bundling…" : "review"}
            sub=".html"
            disabled={!feedback || !transcript || !videoUrl || bundleBusy}
            onClick={handleDownloadBundle}
          />
        </div>
        <div className="kicker">
          {modelLabel ? (
            <>
              Analysed by{" "}
              <span className="text-[var(--color-paper)] font-semibold">
                {modelLabel}
              </span>
              {generatedAt ? <> · {formatGeneratedAt(generatedAt)}</> : null}
            </>
          ) : status === "ready" ? (
            "—"
          ) : (
            <span className="text-[var(--color-brass)]">
              {status === "transcribing"
                ? "Transcribing locally with distil-medium.en…"
                : status === "analyzing"
                  ? "Asking the LLM…"
                  : "Working…"}
            </span>
          )}
        </div>
      </div>

      {/* Show the transcript as soon as transcription finishes, even if
          the LLM is still working. Replay + click-to-jump lives here. */}
      {transcript ? (
        <div className="mt-10 reveal reveal-2">
          {videoUrl ? (
            <Replay videoUrl={videoUrl} transcript={transcript} />
          ) : (
            <Transcript transcript={transcript} />
          )}
        </div>
      ) : null}

      {/* Loading + error states (while transcribing or analyzing) */}
      {status !== "ready" || !feedback ? (
        <div className="mt-10 reveal reveal-3">
          {status === "error" ? (
            <ErrorBlock error={error} onRetake={onRetake} />
          ) : (
            <LoadingBlock status={status} />
          )}
        </div>
      ) : (
        <ReadyBody
          feedback={feedback}
          stats={stats}
          durationSec={durationSec}
          wordCount={wordCount}
          rehearsalKind={rehearsalKind}
          contextProvided={contextProvided}
          onRetake={onRetake}
          onCopyMarkdown={onCopyMarkdown}
        />
      )}
    </article>
  );
}

function ReadyBody({
  feedback,
  stats,
  durationSec,
  wordCount,
  rehearsalKind,
  contextProvided,
  onRetake,
  onCopyMarkdown,
}: {
  feedback: Feedback;
  stats: StatsSnapshot;
  durationSec: number;
  wordCount: number;
  rehearsalKind: RehearsalKind;
  contextProvided: boolean;
  onRetake: () => void;
  onCopyMarkdown: () => void;
}) {
  return (
    <>
      {/* Headline */}
      <header className="mt-10 reveal reveal-2">
        <div className="kicker">Delivery review · Take 1</div>
        <div className="mt-4 grid gap-8 md:grid-cols-[auto_1fr] md:items-end">
          <div className="leading-[0.85] font-semibold tracking-tight text-[var(--color-paper)]">
            <span className="tape text-[clamp(88px,15vw,180px)] tnum">
              {feedback.scoreOutOf10.toFixed(1)}
            </span>
            <span className="text-[var(--color-paper-3)] text-[clamp(28px,4vw,52px)] align-top ml-1">
              /10
            </span>
          </div>
          <p className="text-[clamp(17px,1.5vw,20px)] leading-[1.5] text-[var(--color-paper)] max-w-[58ch]">
            {feedback.takeaway}
          </p>
        </div>
      </header>

      {/* Stats strip */}
      <div className="mt-10 grid grid-cols-2 md:grid-cols-4 border-y border-[var(--color-ink-2)] reveal reveal-3">
        <StatTile label="Duration" value={formatElapsed(Math.round(durationSec))} />
        <StatTile label="Words" value={String(wordCount)} />
        <StatTile label="Median pace" value={String(stats.wpm || "—")} unit={stats.wpm ? "wpm" : ""} />
        <StatTile
          label="Filler ratio"
          value={stats.takenAt ? stats.fillerPct.toFixed(1) : "—"}
          unit={stats.takenAt ? "%" : ""}
          last
        />
      </div>

      {/* Body */}
      <div className="mt-12 grid gap-12 md:grid-cols-[1fr_320px]">
        <main className="space-y-12 reveal reveal-4">
          <Section kicker="Strengths" title="What landed">
            <ul className="space-y-3 text-[16px] leading-[1.55] text-[var(--color-paper)]">
              {feedback.strengths.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-mono text-[var(--color-brass)] text-sm pt-0.5 tnum font-semibold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section kicker="Top three fixes" title="What to change">
            <ol className="space-y-6">
              {feedback.topFixes.map((f, i) => (
                <li key={i} className="grid grid-cols-[auto_1fr] gap-5">
                  <span className="font-mono font-semibold text-4xl text-[var(--color-hazard)] leading-none tnum">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-[17px] font-semibold text-[var(--color-paper)]">
                      {f.title}
                    </div>
                    <div className="mt-1 text-[15px] text-[var(--color-paper-2)] leading-[1.55]">
                      {f.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <div className="grid gap-8 md:grid-cols-2">
            <Section kicker="Pace" title="Tempo & rhythm">
              <p className="text-[15px] text-[var(--color-paper)] leading-[1.6]">
                {feedback.paceFeedback}
              </p>
            </Section>
            <Section kicker="Filler words" title="Hedging language">
              <p className="text-[15px] text-[var(--color-paper)] leading-[1.6]">
                {feedback.fillerFeedback}
              </p>
            </Section>
            <Section kicker="Structure" title="Arc & pacing">
              <p className="text-[15px] text-[var(--color-paper)] leading-[1.6]">
                {feedback.structureFeedback}
              </p>
            </Section>
            {contextProvided && feedback.alignmentFeedback ? (
              <Section kicker="Alignment" title="On-brief?">
                <p className="text-[15px] text-[var(--color-paper)] leading-[1.6]">
                  {feedback.alignmentFeedback}
                </p>
              </Section>
            ) : null}
          </div>

          <Section kicker="Rehearsal prompts" title="Next take">
            <ol className="space-y-4">
              {feedback.rehearsalPrompts.map((p, i) => (
                <li key={i} className="border-l-2 border-[var(--color-brass)] pl-4">
                  <span className="kicker block mb-1">Prompt {i + 1}</span>
                  <span className="text-[16px] text-[var(--color-paper)] leading-[1.5]">
                    {p}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          <div className="border-t border-[var(--color-ink-2)] pt-6 flex flex-wrap gap-3">
            <button
              onClick={onRetake}
              className="px-4 py-2.5 bg-[var(--color-hazard)] text-[var(--color-ink-0)] font-mono uppercase tracking-[0.22em] text-xs font-semibold hover:brightness-110 transition"
            >
              ◉ Record another take
            </button>
            <button
              onClick={onCopyMarkdown}
              className="px-4 py-2.5 border border-[var(--color-ink-2)] text-[var(--color-paper)] font-mono uppercase tracking-[0.22em] text-xs hover:border-[var(--color-paper)] transition"
            >
              Copy as markdown
            </button>
          </div>
        </main>

        <aside className="space-y-8 reveal reveal-5">
          <div className="bg-[var(--color-ink-1)] border border-[var(--color-ink-2)] p-5">
            <div className="kicker mb-3">At a glance</div>
            <Glance label="Pace" value={stats.wpm ? `${stats.wpm} wpm` : "—"} tone={stats.paceTone} />
            <Glance label="Fillers" value={stats.takenAt ? `${stats.fillerPct}%` : "—"} tone={stats.fillerTone} />
            <Glance
              label={`Pauses > ${stats.longestPauseSec > 5 ? "5" : "2"}s`}
              value={String(stats.longPauses)}
              tone={stats.pauseTone}
            />
            {feedback.keyTermsTotal !== null && feedback.keyTermsTotal > 0 ? (
              <Glance
                label="Key terms"
                value={`${feedback.keyTermsHit ?? 0} / ${feedback.keyTermsTotal}`}
                tone={
                  (feedback.keyTermsHit ?? 0) >=
                  Math.ceil(feedback.keyTermsTotal * 0.7)
                    ? "good"
                    : "watch"
                }
                last={rehearsalKind !== "interview" || feedback.starArc === null}
              />
            ) : null}
            {rehearsalKind === "interview" && feedback.starArc !== null ? (
              <Glance
                label="STAR arc"
                value={`${feedback.starArc} / 4`}
                tone={
                  feedback.starArc >= 3
                    ? "good"
                    : feedback.starArc >= 2
                      ? "watch"
                      : "warn"
                }
                last
              />
            ) : null}
          </div>

          {feedback.notableMoments.length ? (
            <div>
              <div className="kicker mb-3">Notable moments</div>
              <ol className="space-y-3">
                {feedback.notableMoments.map((m, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span
                      className={`font-mono tnum font-semibold ${
                        m.kind === "strong"
                          ? "text-[var(--color-brass)]"
                          : "text-[var(--color-oxblood)]"
                      }`}
                    >
                      {m.time}
                    </span>
                    <span className="text-[var(--color-paper)] leading-snug">
                      {m.body}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function LoadingBlock({ status }: { status: AnalysisStatus }) {
  const lines = [
    {
      key: "transcribing",
      label: "Transcribing your audio",
      sub: "distil-medium.en running locally · WebGPU when available",
    },
    {
      key: "analyzing",
      label: "Analyzing your delivery",
      sub: "LLM is reading the transcript with your context",
    },
  ];
  return (
    <div className="border border-[var(--color-ink-2)] p-8 max-w-2xl">
      <div className="kicker mb-3 text-[var(--color-brass)]">In progress</div>
      <ol className="space-y-4">
        {lines.map((l) => {
          const done =
            (status === "analyzing" || status === "ready") && l.key === "transcribing";
          const active =
            (status === "transcribing" && l.key === "transcribing") ||
            (status === "analyzing" && l.key === "analyzing");
          return (
            <li key={l.key} className="flex items-start gap-3">
              <span
                className={`mt-1 inline-block w-2 h-2 rounded-full ${
                  done
                    ? "bg-[var(--color-brass)]"
                    : active
                      ? "bg-[var(--color-hazard)] rec-dot"
                      : "bg-[var(--color-ink-3)]"
                }`}
              />
              <div>
                <div className="text-[var(--color-paper)] font-medium">
                  {l.label}
                </div>
                <div className="text-[12px] text-[var(--color-paper-3)] mt-0.5">
                  {l.sub}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ErrorBlock({
  error,
  onRetake,
}: {
  error: string | null;
  onRetake: () => void;
}) {
  return (
    <div className="border border-[var(--color-oxblood)] p-8 max-w-2xl">
      <div className="kicker mb-3 text-[var(--color-oxblood)]">Failed</div>
      <p className="text-[var(--color-paper)] text-[16px] leading-[1.5]">
        {error || "Something went wrong during analysis."}
      </p>
      <button
        onClick={onRetake}
        className="mt-5 px-4 py-2.5 border border-[var(--color-ink-2)] text-[var(--color-paper)] font-mono uppercase tracking-[0.22em] text-xs hover:border-[var(--color-paper)] transition"
      >
        Try a new take
      </button>
    </div>
  );
}

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="kicker text-[var(--color-brass)]">{kicker}</div>
      <h3 className="text-2xl font-semibold tracking-tight mt-1 mb-4 text-[var(--color-paper)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  unit,
  last,
}: {
  label: string;
  value: string;
  unit?: string;
  last?: boolean;
}) {
  return (
    <div className={`p-5 ${last ? "" : "border-r border-[var(--color-ink-2)]"}`}>
      <div className="kicker">{label}</div>
      <div className="mt-1.5 font-mono tnum text-2xl font-semibold flex items-baseline gap-1 text-[var(--color-paper)]">
        {value}
        {unit ? (
          <span className="text-xs font-normal text-[var(--color-paper-3)]">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Glance({
  label,
  value,
  tone,
  last,
}: {
  label: string;
  value: string;
  tone: "good" | "watch" | "warn";
  last?: boolean;
}) {
  const dot = {
    good: "bg-[var(--color-brass)]",
    watch: "bg-[var(--color-paper-2)]",
    warn: "bg-[var(--color-oxblood)]",
  }[tone];
  return (
    <div
      className={`flex items-center justify-between py-2.5 ${last ? "" : "border-b border-[var(--color-ink-2)]"}`}
    >
      <span className="flex items-center gap-2 text-sm text-[var(--color-paper)]">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="font-mono tnum text-sm text-[var(--color-paper)] font-semibold">
        {value}
      </span>
    </div>
  );
}

function DownloadChip({
  label,
  sub,
  href,
  filename,
  onClick,
  disabled,
}: {
  label: string;
  sub: string;
  href?: string | null;
  filename?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const cls =
    "flex items-center gap-3 border border-[var(--color-ink-2)] px-3 py-2 hover:border-[var(--color-brass)] transition group disabled:opacity-40 disabled:hover:border-[var(--color-ink-2)]";
  const inner = (
    <>
      <span className="text-[var(--color-paper-2)] group-hover:text-[var(--color-brass)] transition font-semibold">
        ↓
      </span>
      <span className="text-left">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper)] font-semibold">
          {label}
        </div>
        <div className="font-mono text-[10px] text-[var(--color-paper-3)] mt-0.5">
          {sub}
        </div>
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} download={filename} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled || !onClick} className={cls}>
      {inner}
    </button>
  );
}

function downloadMarkdown(transcript: TranscribeResponse | null) {
  if (!transcript) return;
  const lines: string[] = [
    "# Rehearsal transcript",
    "",
    "_Flags: (?) medium confidence, (??) low confidence, ~~strike~~ likely silence._",
    "",
  ];
  for (const s of transcript.segments) {
    const tier = confidenceTier(s);
    const time = `**[${formatElapsed(Math.floor(s.start))}]**`;
    const text = (s.text || "").trim();
    if (tier === "silent") {
      lines.push(`${time} ~~${text}~~`);
    } else if (tier === "low") {
      lines.push(`${time} ${text} (??)`);
    } else if (tier === "medium") {
      lines.push(`${time} ${text} (?)`);
    } else {
      lines.push(`${time} ${text}`);
    }
  }
  if (!transcript.segments.length) lines.push(transcript.text);
  const blob = new Blob([lines.join("\n\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rehearsal-transcript.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatGeneratedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error || new Error("FileReader failed"));
    r.readAsDataURL(blob);
  });
}

async function downloadSelfContainedHtml(opts: {
  videoUrl: string;
  videoMime: string | null;
  feedback: Feedback;
  transcript: TranscribeResponse;
  stats: StatsSnapshot;
  durationSec: number;
  wordCount: number;
  modelLabel: string | null;
  generatedAt: string | null;
  rehearsalKind: RehearsalKind;
  contextProvided: boolean;
}) {
  const {
    videoUrl,
    videoMime,
    feedback: fb,
    transcript,
    stats,
    durationSec,
    wordCount,
    modelLabel,
    generatedAt,
    contextProvided,
  } = opts;

  // Pull the video blob and inline it as a data URL so the HTML is portable.
  const videoBlob = await fetch(videoUrl).then((r) => r.blob());
  const videoDataUrl = await blobToDataUrl(
    videoMime ? new Blob([videoBlob], { type: videoMime }) : videoBlob,
  );

  const segmentsHtml = transcript.segments
    .map((s, i) => {
      const time = formatElapsed(Math.floor(s.start));
      return `<li data-start="${s.start.toFixed(3)}" data-end="${s.end.toFixed(3)}" data-i="${i}"><span class="t">${time}</span><span class="text">${escapeHtml(s.text.trim() || "—")}</span></li>`;
    })
    .join("");

  const strengthsHtml = fb.strengths
    .map(
      (s, i) =>
        `<li><span class="num">${String(i + 1).padStart(2, "0")}</span><span>${escapeHtml(s)}</span></li>`,
    )
    .join("");

  const fixesHtml = fb.topFixes
    .map(
      (f, i) =>
        `<li><span class="big-num">${i + 1}</span><div><div class="fix-title">${escapeHtml(f.title)}</div><div class="fix-detail">${escapeHtml(f.detail)}</div></div></li>`,
    )
    .join("");

  const promptsHtml = fb.rehearsalPrompts
    .map(
      (p, i) =>
        `<li><span class="kicker">Prompt ${i + 1}</span><span class="prompt-text">${escapeHtml(p)}</span></li>`,
    )
    .join("");

  const momentsHtml = fb.notableMoments
    .map(
      (m) =>
        `<li><span class="moment-time ${m.kind}">${escapeHtml(m.time)}</span><span>${escapeHtml(m.body)}</span></li>`,
    )
    .join("");

  const fillerStat = stats.takenAt ? `${stats.fillerPct.toFixed(1)}%` : "—";
  const wpmStat = stats.wpm ? String(stats.wpm) : "—";
  const generated = generatedAt ? formatGeneratedAt(generatedAt) : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Delivery review — The Rehearsal</title>
<style>
:root {
  --ink-0: #0f0d0b;
  --ink-1: #1a1714;
  --ink-2: #2f2a24;
  --paper: #fbfaf7;
  --paper-2: #b5ad9f;
  --paper-3: #6e675c;
  --hazard: #ff6028;
  --brass: #e5c870;
  --oxblood: #e0392c;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--ink-0); color: var(--paper); }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.5; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.kicker { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.22em; color: var(--paper-3); }
.tnum { font-variant-numeric: tabular-nums; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 40px 24px; }
.masthead { border-bottom: 1px solid var(--ink-2); padding-bottom: 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; }
.masthead h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
.layout { display: grid; gap: 32px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
.video-col { position: sticky; top: 16px; }
video { width: 100%; aspect-ratio: 16/9; background: var(--ink-1); border: 1px solid var(--ink-2); display: block; }
.video-hint { margin-top: 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.22em; color: var(--paper-3); font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.transcript { min-width: 0; }
.transcript h3 { margin: 0 0 4px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
.transcript .hint { color: var(--paper-2); font-size: 13px; margin-bottom: 16px; }
.tlist { list-style: none; padding: 0; margin: 0; max-height: 480px; overflow-y: auto; }
.tlist li { display: flex; gap: 12px; padding: 4px 8px; font-size: 14px; line-height: 1.55; cursor: pointer; border-radius: 2px; transition: background 0.15s; }
.tlist li:hover { background: var(--ink-1); }
.tlist li.active { background: rgba(47, 42, 36, 0.8); border-left: 2px solid var(--brass); padding-left: 6px; }
.tlist .t { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--paper-3); padding-top: 2px; min-width: 48px; text-align: right; flex-shrink: 0; }
.tlist li.active .t { color: var(--brass); font-weight: 600; }
.tlist .text { color: var(--paper); }
.section { margin-top: 56px; }
.score { display: grid; grid-template-columns: auto 1fr; gap: 32px; align-items: end; margin-top: 40px; }
.bignum { font-size: clamp(88px, 15vw, 180px); font-weight: 600; line-height: 0.85; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.score .slash { color: var(--paper-3); font-size: clamp(28px, 4vw, 52px); font-weight: 600; }
.score .takeaway { font-size: clamp(17px, 1.5vw, 20px); line-height: 1.5; max-width: 58ch; }
.stat-strip { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--ink-2); border-bottom: 1px solid var(--ink-2); margin-top: 40px; }
.stat-strip .tile { padding: 20px; border-right: 1px solid var(--ink-2); }
.stat-strip .tile:last-child { border-right: 0; }
.stat-strip .val { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; font-size: 24px; font-weight: 600; margin-top: 6px; }
.stat-strip .unit { font-size: 12px; color: var(--paper-3); font-weight: 400; margin-left: 4px; }
h2.section-title { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; margin: 4px 0 16px; }
.strengths { list-style: none; padding: 0; margin: 0; }
.strengths li { display: flex; gap: 12px; padding: 6px 0; font-size: 16px; line-height: 1.55; }
.strengths .num { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; color: var(--brass); font-weight: 600; font-size: 14px; padding-top: 2px; }
.fixes { list-style: none; padding: 0; margin: 0; }
.fixes li { display: grid; grid-template-columns: auto 1fr; gap: 20px; margin-bottom: 24px; }
.fixes .big-num { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; font-size: 36px; font-weight: 600; color: var(--hazard); line-height: 1; }
.fixes .fix-title { font-size: 17px; font-weight: 600; }
.fixes .fix-detail { font-size: 15px; color: var(--paper-2); margin-top: 4px; line-height: 1.55; }
.subs { display: grid; gap: 32px; grid-template-columns: repeat(2, 1fr); margin-top: 32px; }
.subs h3 { margin: 4px 0 8px; font-size: 18px; font-weight: 600; }
.subs p { margin: 0; color: var(--paper); font-size: 15px; line-height: 1.6; }
.prompts { list-style: none; padding: 0; margin: 0; }
.prompts li { border-left: 2px solid var(--brass); padding: 4px 0 8px 16px; margin-bottom: 12px; }
.prompts .kicker { display: block; margin-bottom: 4px; }
.prompts .prompt-text { display: block; font-size: 16px; line-height: 1.5; }
.moments { list-style: none; padding: 0; margin: 0; }
.moments li { display: flex; gap: 12px; padding: 6px 0; font-size: 14px; line-height: 1.4; }
.moment-time { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; font-weight: 600; flex-shrink: 0; }
.moment-time.strong { color: var(--brass); }
.moment-time.watch { color: var(--oxblood); }
footer { margin-top: 80px; padding: 24px; border-top: 1px solid var(--ink-2); font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.22em; color: var(--paper-3); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .video-col { position: static; }
  .subs { grid-template-columns: 1fr; }
  .stat-strip { grid-template-columns: repeat(2, 1fr); }
  .stat-strip .tile:nth-child(2) { border-right: 0; }
}
</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <div>
      <div class="kicker">The Rehearsal · delivery review</div>
      <h1>Take 1 — exported review</h1>
    </div>
    <div class="kicker">
      ${modelLabel ? `Analysed by <span style="color:var(--paper)">${escapeHtml(modelLabel)}</span>` : ""}
      ${modelLabel && generated ? " · " : ""}${escapeHtml(generated)}
    </div>
  </header>

  <section class="layout">
    <div class="video-col">
      <video id="player" controls playsinline src="${videoDataUrl}"></video>
      <div class="video-hint">Replay · click a transcript line to jump</div>
    </div>
    <div class="transcript">
      <div class="kicker" style="color: var(--brass)">Transcript</div>
      <h3>Transcript</h3>
      <div class="hint">${transcript.segments.length} segment${transcript.segments.length === 1 ? "" : "s"} · click to jump</div>
      <ol class="tlist" id="tlist">${segmentsHtml}</ol>
    </div>
  </section>

  <header class="section">
    <div class="kicker">Delivery review · Take 1</div>
    <div class="score">
      <div>
        <span class="bignum">${fb.scoreOutOf10.toFixed(1)}</span><span class="slash">/10</span>
      </div>
      <p class="takeaway">${escapeHtml(fb.takeaway)}</p>
    </div>
  </header>

  <div class="stat-strip">
    <div class="tile"><div class="kicker">Duration</div><div class="val tnum">${formatElapsed(Math.round(durationSec))}</div></div>
    <div class="tile"><div class="kicker">Words</div><div class="val tnum">${wordCount}</div></div>
    <div class="tile"><div class="kicker">Median pace</div><div class="val tnum">${wpmStat}${stats.wpm ? '<span class="unit">wpm</span>' : ""}</div></div>
    <div class="tile"><div class="kicker">Filler ratio</div><div class="val tnum">${fillerStat}</div></div>
  </div>

  <section class="section">
    <div class="kicker" style="color: var(--brass)">Strengths</div>
    <h2 class="section-title">What landed</h2>
    <ul class="strengths">${strengthsHtml}</ul>
  </section>

  <section class="section">
    <div class="kicker" style="color: var(--brass)">Top three fixes</div>
    <h2 class="section-title">What to change</h2>
    <ol class="fixes">${fixesHtml}</ol>
  </section>

  <div class="subs">
    <section>
      <div class="kicker" style="color: var(--brass)">Pace</div>
      <h3>Tempo &amp; rhythm</h3>
      <p>${escapeHtml(fb.paceFeedback)}</p>
    </section>
    <section>
      <div class="kicker" style="color: var(--brass)">Filler words</div>
      <h3>Hedging language</h3>
      <p>${escapeHtml(fb.fillerFeedback)}</p>
    </section>
    <section>
      <div class="kicker" style="color: var(--brass)">Structure</div>
      <h3>Arc &amp; pacing</h3>
      <p>${escapeHtml(fb.structureFeedback)}</p>
    </section>
    ${
      contextProvided && fb.alignmentFeedback
        ? `<section>
      <div class="kicker" style="color: var(--brass)">Alignment</div>
      <h3>On-brief?</h3>
      <p>${escapeHtml(fb.alignmentFeedback)}</p>
    </section>`
        : ""
    }
  </div>

  <section class="section">
    <div class="kicker" style="color: var(--brass)">Rehearsal prompts</div>
    <h2 class="section-title">Next take</h2>
    <ol class="prompts">${promptsHtml}</ol>
  </section>

  ${
    fb.notableMoments.length
      ? `<section class="section">
    <div class="kicker">Notable moments</div>
    <ul class="moments">${momentsHtml}</ul>
  </section>`
      : ""
  }

  <footer>
    <span>The Rehearsal · Issue 01</span>
    <span>Self-contained export · click transcript to seek</span>
  </footer>
</div>

<script>
(function () {
  var v = document.getElementById('player');
  var list = document.getElementById('tlist');
  if (!v || !list) return;
  var items = Array.prototype.slice.call(list.querySelectorAll('li[data-start]'));
  function setActive(li) {
    items.forEach(function (x) { x.classList.remove('active'); });
    if (li) li.classList.add('active');
  }
  list.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== list && t.tagName !== 'LI') t = t.parentNode;
    if (!t || t === list) return;
    var s = parseFloat(t.getAttribute('data-start'));
    if (!isFinite(s)) return;
    v.currentTime = Math.max(0, s);
    if (v.paused) v.play().catch(function () {});
    setActive(t);
    t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  v.addEventListener('timeupdate', function () {
    var t = v.currentTime;
    var active = null;
    for (var i = 0; i < items.length; i++) {
      var s = parseFloat(items[i].getAttribute('data-start'));
      var e = parseFloat(items[i].getAttribute('data-end'));
      if (t >= s && t < e) { active = items[i]; break; }
      if (s <= t) active = items[i];
      else break;
    }
    if (active && !active.classList.contains('active')) {
      setActive(active);
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
})();
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rehearsal-review.html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
