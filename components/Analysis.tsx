"use client";

import type { Feedback } from "@/lib/feedback-schema";
import type { TranscribeResponse } from "@/app/api/transcribe/route";
import type { StatsSnapshot } from "@/lib/stats";
import { formatElapsed } from "@/lib/recorder";
import { countWords } from "@/lib/stats";

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
  jdWasProvided,
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
  jdWasProvided: boolean;
  onRetake: () => void;
  onCopyMarkdown: () => void;
}) {
  const wordCount = transcript ? countWords(transcript.text) : 0;
  const ext = (mime: string | null) =>
    !mime ? "bin" : mime.includes("mp4") ? "mp4" : "webm";

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
          <DownloadChip
            label="audio"
            sub={`.${ext(audioMime)}`}
            href={audioUrl}
            filename={`rehearsal-audio.${ext(audioMime)}`}
          />
          <DownloadChip
            label="transcript"
            sub=".md"
            disabled={!transcript}
            onClick={() => downloadMarkdown(transcript)}
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
                ? "Generating clean transcript via Groq…"
                : status === "analyzing"
                  ? "Asking the LLM…"
                  : "Working…"}
            </span>
          )}
        </div>
      </div>

      {/* Loading + error states */}
      {status !== "ready" || !feedback ? (
        <div className="mt-16 reveal reveal-2">
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
          jdWasProvided={jdWasProvided}
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
  jdWasProvided,
  onRetake,
  onCopyMarkdown,
}: {
  feedback: Feedback;
  stats: StatsSnapshot;
  durationSec: number;
  wordCount: number;
  jdWasProvided: boolean;
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
      <div className="mt-10 grid gap-12 md:grid-cols-[1fr_320px]">
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
            {jdWasProvided && feedback.alignmentFeedback ? (
              <Section kicker="JD alignment" title="On-brief?">
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
            {feedback.jdKeywordsTotal !== null && feedback.jdKeywordsTotal > 0 ? (
              <Glance
                label="JD keywords"
                value={`${feedback.jdKeywordsHit ?? 0} / ${feedback.jdKeywordsTotal}`}
                tone={
                  (feedback.jdKeywordsHit ?? 0) >=
                  Math.ceil(feedback.jdKeywordsTotal * 0.7)
                    ? "good"
                    : "watch"
                }
              />
            ) : null}
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
      label: "Generating clean transcript",
      sub: "Groq Whisper-large-v3-turbo · cloud pass on the full audio",
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
  const lines: string[] = ["# Rehearsal transcript", ""];
  for (const s of transcript.segments) {
    lines.push(`**[${formatElapsed(Math.floor(s.start))}]** ${s.text}`);
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
