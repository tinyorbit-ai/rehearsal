"use client";

import { useState } from "react";
import { Masthead } from "@/components/Masthead";
import { Setup } from "@/components/Setup";
import { Recording } from "@/components/Recording";
import { Analysis, type AnalysisStatus } from "@/components/Analysis";
import { useRecorder, formatElapsed } from "@/lib/recorder";
import { useTranscription } from "@/lib/transcription";
import { useStats, EMPTY_STATS } from "@/lib/stats";
import { EMPTY_PREP, type Prep } from "@/components/Preparation";
import type { Feedback } from "@/lib/feedback-schema";
import type { TranscribeResponse } from "@/app/api/transcribe/route";

type View = "setup" | "recording" | "analysis";

export default function Page() {
  const [view, setView] = useState<View>("setup");
  const [prep, setPrep] = useState<Prep>(EMPTY_PREP);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [transcript, setTranscript] = useState<TranscribeResponse | null>(null);
  const [analysisStatus, setAnalysisStatus] =
    useState<AnalysisStatus>("transcribing");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [stoppedStats, setStoppedStats] = useState(EMPTY_STATS);
  const [stoppedDurationSec, setStoppedDurationSec] = useState(0);

  const recorder = useRecorder();
  const transcription = useTranscription();
  const { snapshot: stats, lastUpdateAgoSec } = useStats({
    localWindows: transcription.localWindows,
    rmsSamples: transcription.rmsSamples,
    elapsedSec: recorder.elapsedSec,
    active: recorder.state === "recording",
  });

  // Plain async functions — React Compiler memoizes as needed.
  async function handleStart() {
    let stream = recorder.stream;
    if (!stream) {
      stream = await recorder.requestAccess();
    }
    if (!stream) return;
    const startMs = performance.now();
    recorder.start(stream);
    const audioStream = new MediaStream(stream.getAudioTracks());
    await transcription.start(audioStream, startMs);
    setView("recording");
  }

  async function handleStop() {
    setStoppedStats(stats);
    transcription.stop();

    setFeedback(null);
    setTranscript(null);
    setAnalysisError(null);
    setAnalysisStatus("transcribing");
    setView("analysis");

    let stopResult: Awaited<ReturnType<typeof recorder.stop>>;
    try {
      stopResult = await recorder.stop();
    } catch (err) {
      setAnalysisError(`Recorder stop failed: ${(err as Error).message}`);
      setAnalysisStatus("error");
      return;
    }
    setStoppedDurationSec(stopResult.durationSec);

    if (!stopResult.audioBlob || stopResult.audioBlob.size === 0) {
      setAnalysisError(
        "No audio was captured. The microphone may have been blocked or muted.",
      );
      setAnalysisStatus("error");
      return;
    }

    let transcribed: TranscribeResponse;
    try {
      const form = new FormData();
      const ext = stopResult.audioMime?.includes("mp4") ? "mp4" : "webm";
      form.set(
        "file",
        new File([stopResult.audioBlob], `audio.${ext}`, {
          type: stopResult.audioMime || "audio/webm",
        }),
      );
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = (await res.json()) as TranscribeResponse | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error(("error" in data && data.error) || `Transcribe ${res.status}`);
      }
      transcribed = data;
      setTranscript(data);
    } catch (err) {
      setAnalysisError(`Transcription failed: ${(err as Error).message}`);
      setAnalysisStatus("error");
      return;
    }

    setAnalysisStatus("analyzing");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcribed.text,
          segments: transcribed.segments,
          durationSec: transcribed.duration || stopResult.durationSec,
          goal: prep.goal || undefined,
          jd: prep.jd || undefined,
          cvText: prep.cvText || undefined,
          prepText: prep.prepText || undefined,
          stats: stats.takenAt
            ? {
                wpm: stats.wpm,
                fillerPct: stats.fillerPct,
                longPauses: stats.longPauses,
                longestPauseSec: stats.longestPauseSec,
              }
            : undefined,
        }),
      });
      const data = (await res.json()) as
        | { feedback: Feedback; modelLabel: string; generatedAt: string }
        | { error: string };
      if (!res.ok || "error" in data) {
        throw new Error(("error" in data && data.error) || `Analyze ${res.status}`);
      }
      setFeedback(data.feedback);
      setModelLabel(data.modelLabel);
      setGeneratedAt(data.generatedAt);
      setAnalysisStatus("ready");
    } catch (err) {
      setAnalysisError(`Analysis failed: ${(err as Error).message}`);
      setAnalysisStatus("error");
    }
  }

  function handleRetake() {
    recorder.reset();
    transcription.reset();
    setFeedback(null);
    setTranscript(null);
    setAnalysisError(null);
    setView("setup");
  }

  function onCopyMarkdown() {
    if (!feedback) return;
    const md = feedbackToMarkdown(feedback, modelLabel, generatedAt);
    navigator.clipboard.writeText(md);
  }

  return (
    <main className="relative">
      <Masthead view={view} />
      {view === "setup" && (
        <Setup
          recorderState={recorder.state}
          recorderError={recorder.error}
          stream={recorder.stream}
          prep={prep}
          onPrepChange={setPrep}
          onStart={handleStart}
        />
      )}
      {view === "recording" && (
        <Recording
          stream={recorder.stream}
          caption={transcription.caption}
          timer={formatElapsed(recorder.elapsedSec)}
          modelStatus={transcription.status}
          modelBackend={transcription.backend}
          loadProgress={transcription.loadProgress}
          loadFile={transcription.loadFile}
          transcriptionError={transcription.error}
          currentRms={transcription.currentRms}
          stats={stats}
          lastUpdateAgoSec={lastUpdateAgoSec}
          onStop={handleStop}
        />
      )}
      {view === "analysis" && (
        <Analysis
          status={analysisStatus}
          error={analysisError}
          videoUrl={recorder.videoUrl}
          audioUrl={recorder.audioUrl}
          videoMime={recorder.videoMime}
          audioMime={recorder.audioMime}
          durationSec={stoppedDurationSec || transcript?.duration || 0}
          feedback={feedback}
          modelLabel={modelLabel}
          generatedAt={generatedAt}
          stats={stoppedStats}
          transcript={transcript}
          jdWasProvided={Boolean(prep.jd || prep.goal || prep.cvText || prep.prepText)}
          onRetake={handleRetake}
          onCopyMarkdown={onCopyMarkdown}
        />
      )}
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-[var(--color-ink-2)]">
      <div className="mx-auto max-w-[1240px] px-6 py-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)]">
        <span>The Rehearsal · Issue 01</span>
        <span>On-device captions · cloud transcript &amp; analysis on stop</span>
      </div>
    </footer>
  );
}

function feedbackToMarkdown(
  fb: Feedback,
  modelLabel: string | null,
  generatedAt: string | null,
): string {
  const lines: string[] = [];
  lines.push(`# Delivery review`);
  if (modelLabel || generatedAt) {
    lines.push(
      `_${modelLabel ?? ""}${modelLabel && generatedAt ? " · " : ""}${generatedAt ?? ""}_`,
    );
  }
  lines.push(``);
  lines.push(`**Score: ${fb.scoreOutOf10.toFixed(1)} / 10**`);
  lines.push(``);
  lines.push(fb.takeaway);
  lines.push(``, `## Strengths`);
  fb.strengths.forEach((s) => lines.push(`- ${s}`));
  lines.push(``, `## Top three fixes`);
  fb.topFixes.forEach((f, i) => {
    lines.push(`${i + 1}. **${f.title}** — ${f.detail}`);
  });
  lines.push(``, `## Pace`, fb.paceFeedback);
  lines.push(``, `## Filler words`, fb.fillerFeedback);
  lines.push(``, `## Structure`, fb.structureFeedback);
  if (fb.alignmentFeedback) lines.push(``, `## Alignment`, fb.alignmentFeedback);
  lines.push(``, `## Rehearsal prompts`);
  fb.rehearsalPrompts.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  lines.push(``, `## Notable moments`);
  fb.notableMoments.forEach((m) =>
    lines.push(`- **${m.time}** _(${m.kind})_ — ${m.body}`),
  );
  lines.push(``, `STAR arc: ${fb.starArc} / 4`);
  return lines.join("\n");
}
