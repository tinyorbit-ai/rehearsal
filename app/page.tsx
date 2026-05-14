"use client";

import { useState } from "react";
import { Masthead } from "@/components/Masthead";
import { ModelStatusBar } from "@/components/ModelStatusBar";
import { SupportWarning } from "@/components/SupportWarning";
import { Setup } from "@/components/Setup";
import { Recording } from "@/components/Recording";
import { Analysis, type AnalysisStatus } from "@/components/Analysis";
import { useBrowserSupport } from "@/lib/browser-support";
import { useShortcuts } from "@/lib/use-shortcuts";
import { useRecorder, formatElapsed } from "@/lib/recorder";
import { useTranscription } from "@/lib/transcription";
import { useStats, EMPTY_STATS } from "@/lib/stats";
import { EMPTY_PREP, type Prep } from "@/components/Preparation";
import type { Feedback } from "@/lib/feedback-schema";
import { feedbackToMarkdown } from "@/lib/markdown";
import type { TranscribeResponse } from "@/lib/transcription";

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
  const [uploadedVideo, setUploadedVideo] = useState<{
    url: string;
    mime: string;
  } | null>(null);

  const support = useBrowserSupport();
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
    // Camera/mic are no longer needed for the rest of the analysis flow —
    // release the hardware indicator immediately so the user knows the
    // camera is off while they read the review.
    recorder.releaseCamera();

    if (!stopResult.audioBlob || stopResult.audioBlob.size === 0) {
      setAnalysisError(
        "No audio was captured. The microphone may have been blocked or muted.",
      );
      setAnalysisStatus("error");
      return;
    }

    let transcribed: TranscribeResponse;
    try {
      transcribed = await transcription.transcribeFull(stopResult.audioBlob);
      setTranscript(transcribed);
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
          kind: prep.kind,
          goal: prep.goal || undefined,
          brief: prep.brief || undefined,
          materialText: prep.materialText || undefined,
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

  async function handleUpload(file: File) {
    // Skip the live recording path entirely. The uploaded video becomes the
    // source-of-truth for both the Replay player and the post-stop pipeline.
    if (recorder.stream) recorder.releaseCamera();
    transcription.reset();

    const mime = file.type || "video/mp4";
    if (uploadedVideo) URL.revokeObjectURL(uploadedVideo.url);
    const url = URL.createObjectURL(file);
    setUploadedVideo({ url, mime });
    setStoppedStats(EMPTY_STATS);

    setFeedback(null);
    setTranscript(null);
    setAnalysisError(null);
    setAnalysisStatus("transcribing");
    setView("analysis");

    let transcribed: TranscribeResponse;
    try {
      transcribed = await transcription.transcribeFull(file);
      setTranscript(transcribed);
    } catch (err) {
      setAnalysisError(`Transcription failed: ${(err as Error).message}`);
      setAnalysisStatus("error");
      return;
    }
    setStoppedDurationSec(transcribed.duration);

    setAnalysisStatus("analyzing");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcribed.text,
          segments: transcribed.segments,
          durationSec: transcribed.duration,
          kind: prep.kind,
          goal: prep.goal || undefined,
          brief: prep.brief || undefined,
          materialText: prep.materialText || undefined,
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
    recorder.release();
    transcription.reset();
    if (uploadedVideo) URL.revokeObjectURL(uploadedVideo.url);
    setUploadedVideo(null);
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

  useShortcuts({
    view,
    recorderBusy: recorder.state === "requesting",
    onStart: handleStart,
    onStop: handleStop,
    onRetake: handleRetake,
  });

  return (
    <main className="relative">
      <Masthead view={view} />
      <SupportWarning report={support} />
      <ModelStatusBar
        status={transcription.status}
        backend={transcription.backend}
        loadProgress={transcription.loadProgress}
        loadFile={transcription.loadFile}
        loadBytesDone={transcription.loadBytesDone}
        loadBytesTotal={transcription.loadBytesTotal}
        loadFilesDone={transcription.loadFilesDone}
        loadFilesSeen={transcription.loadFilesSeen}
        error={transcription.error}
      />
      {view === "setup" && (
        <Setup
          recorderState={recorder.state}
          recorderError={recorder.error}
          stream={recorder.stream}
          prep={prep}
          onPrepChange={setPrep}
          onStart={handleStart}
          onUpload={handleUpload}
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
          videoUrl={uploadedVideo?.url ?? recorder.videoUrl}
          audioUrl={uploadedVideo ? null : recorder.audioUrl}
          videoMime={uploadedVideo?.mime ?? recorder.videoMime}
          audioMime={uploadedVideo ? null : recorder.audioMime}
          durationSec={stoppedDurationSec || transcript?.duration || 0}
          feedback={feedback}
          modelLabel={modelLabel}
          generatedAt={generatedAt}
          stats={stoppedStats}
          transcript={transcript}
          rehearsalKind={prep.kind}
          contextProvided={Boolean(prep.brief || prep.goal || prep.materialText)}
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
        <span>
          The Rehearsal · by{" "}
          <a
            href="https://tinyorbit.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-paper-2)] hover:text-[var(--color-brass)] transition"
          >
            TinyOrbit
          </a>
        </span>
        <span>On-device transcription · LLM analysis on stop</span>
      </div>
    </footer>
  );
}

