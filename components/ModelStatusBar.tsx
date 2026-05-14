"use client";

import type { ModelStatus } from "@/lib/transcription";

export function ModelStatusBar({
  status,
  backend,
  loadProgress,
  loadFile,
  loadBytesDone,
  loadBytesTotal,
  loadFilesDone,
  loadFilesSeen,
  error,
}: {
  status: ModelStatus;
  backend: "webgpu" | "wasm" | null;
  loadProgress: number;
  loadFile: string | null;
  loadBytesDone: number;
  loadBytesTotal: number;
  loadFilesDone: number;
  loadFilesSeen: number;
  error: string | null;
}) {
  if (status === "ready") return null;

  const isError = status === "error";
  const isLoading = status === "loading";
  const pct = Math.max(0, Math.min(100, loadProgress));
  const bytes =
    loadBytesTotal > 0
      ? `${formatBytes(loadBytesDone)} / ${formatBytes(loadBytesTotal)}`
      : null;
  const fileCount =
    loadFilesSeen > 0
      ? `${loadFilesDone}/${loadFilesSeen} file${loadFilesSeen === 1 ? "" : "s"}`
      : null;
  const currentFile = loadFile ? truncate(loadFile, 28) : null;

  return (
    <div className="border-b border-[var(--color-ink-2)] bg-[var(--color-ink-1)]">
      <div className="mx-auto max-w-[1240px] px-6 py-2.5 flex items-center gap-3">
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
            isError ? "" : "rec-dot"
          }`}
          style={{
            background: isError
              ? "var(--color-oxblood)"
              : "var(--color-brass)",
          }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)] shrink-0">
          Speech model
        </span>

        <span className="text-[13px] text-[var(--color-paper)] truncate flex-1 min-w-0">
          {isError ? (
            <>Failed — {error ?? "unknown error"}</>
          ) : isLoading ? (
            <>
              Downloading distil-medium.en
              {currentFile ? (
                <span className="text-[var(--color-paper-2)]">
                  {" · "}
                  {currentFile}
                </span>
              ) : null}
            </>
          ) : (
            "Initializing…"
          )}
        </span>

        {isLoading ? (
          <span className="hidden md:flex items-center gap-3 shrink-0 font-mono text-[11px] text-[var(--color-paper-3)] tabular-nums">
            {fileCount ? <span>{fileCount}</span> : null}
            {bytes ? <span>{bytes}</span> : null}
            <span className="text-[var(--color-paper)]">{pct.toFixed(0)}%</span>
          </span>
        ) : null}

        {isLoading ? <ProgressBar value={pct} /> : null}

        {backend ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)] shrink-0">
            {backend}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-32 h-1 bg-[var(--color-ink-2)] overflow-hidden shrink-0 rounded-sm">
      <div
        className="h-full bg-[var(--color-brass)]"
        style={{
          width: `${Math.min(100, value)}%`,
          // Smooth + only-forward visual; transition cushions monotonic ratchets.
          transition: "width 350ms cubic-bezier(0.2, 0.7, 0.2, 1)",
        }}
      />
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
