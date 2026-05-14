"use client";

import { useState } from "react";

export type RehearsalKind = "presentation" | "pitch" | "interview" | "other";

export type Prep = {
  kind: RehearsalKind;
  goal: string;
  brief: string;
  materialText: string;
  materialName: string;
};

export const EMPTY_PREP: Prep = {
  kind: "presentation",
  goal: "",
  brief: "",
  materialText: "",
  materialName: "",
};

const KIND_OPTIONS: { value: RehearsalKind; label: string; hint: string }[] = [
  {
    value: "presentation",
    label: "Conference / presentation",
    hint: "Keynote, conference talk, internal presentation, all-hands.",
  },
  {
    value: "pitch",
    label: "Sales pitch / demo",
    hint: "Customer pitch, investor pitch, product demo.",
  },
  {
    value: "interview",
    label: "Job interview",
    hint: "STAR-style answer rehearsal.",
  },
  {
    value: "other",
    label: "Other",
    hint: "Podcast, media, panel — anything else you need to deliver.",
  },
];

export function Preparation({
  value,
  onChange,
  compact = false,
}: {
  value: Prep;
  onChange: (next: Prep) => void;
  compact?: boolean;
}) {
  const set = <K extends keyof Prep>(k: K, v: Prep[K]) =>
    onChange({ ...value, [k]: v });

  const goalPlaceholder =
    value.kind === "interview"
      ? "e.g. ‘Staff eng loop at Stripe’"
      : value.kind === "pitch"
        ? "e.g. ‘Series A pitch to Sequoia’"
        : value.kind === "presentation"
          ? "e.g. ‘Keynote at React Summit 2026’"
          : "e.g. ‘Podcast interview with Acquired’";

  return (
    <section
      className={`border-t border-[var(--color-ink-2)] ${compact ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="mx-auto max-w-[1240px] px-6 py-8">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              What are you rehearsing for?
            </h2>
            <p className="text-sm text-[var(--color-paper-2)] mt-1">
              Optional. The more you give, the sharper the feedback.
            </p>
          </div>
          <div className="kicker">All fields optional</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Rehearsal type" hint="Tunes the coaching style and structural framework.">
            <select
              value={value.kind}
              onChange={(e) => set("kind", e.target.value as RehearsalKind)}
              className="field w-full px-3 py-2.5 rounded-none font-sans text-sm"
            >
              {KIND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title" hint={KIND_OPTIONS.find((o) => o.value === value.kind)?.hint ?? ""}>
            <input
              type="text"
              value={value.goal}
              onChange={(e) => set("goal", e.target.value)}
              placeholder={goalPlaceholder}
              className="field w-full px-3 py-2.5 rounded-none font-sans text-sm"
            />
          </Field>

          <Field
            label="Brief"
            hint="Paste any context — audience, goals, key messages, JD, talk abstract. Used for alignment scoring."
          >
            <textarea
              rows={3}
              value={value.brief}
              onChange={(e) => set("brief", e.target.value)}
              placeholder="Audience, goals, key messages, JD, abstract…"
              className="field w-full px-3 py-2.5 rounded-none font-sans text-sm resize-y"
            />
          </Field>

          <Field
            label="Supporting material"
            hint="Slides outline, talking points, brief, CV, prep notes — anything. PDF / Markdown / TXT."
          >
            <FileField
              accept=".pdf,.md,.txt"
              fileName={value.materialName}
              charCount={value.materialText.length}
              onParsed={(text, name) =>
                onChange({ ...value, materialText: text, materialName: name })
              }
              onClear={() => onChange({ ...value, materialText: "", materialName: "" })}
            />
          </Field>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="kicker">{label}</span>
      </div>
      {children}
      <div className="mt-1.5 text-[12px] text-[var(--color-paper-2)]">
        {hint}
      </div>
    </label>
  );
}

function FileField({
  accept,
  fileName,
  charCount,
  onParsed,
  onClear,
}: {
  accept: string;
  fileName: string;
  charCount: number;
  onParsed: (text: string, name: string) => void;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/parse-file", { method: "POST", body: form });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onParsed(data.text || "", file.name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (fileName) {
    return (
      <div className="field flex items-center justify-between px-3 py-2.5 text-sm">
        <span className="truncate">
          <span className="text-[var(--color-paper)] font-medium">{fileName}</span>
          <span className="ml-2 font-mono text-[11px] text-[var(--color-paper-3)]">
            {charCount.toLocaleString()} chars
          </span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-paper-3)] hover:text-[var(--color-oxblood)] transition"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <>
      <label className="field flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer hover:border-[var(--color-brass)] transition">
        <span className="text-[var(--color-paper-3)]">
          {busy ? "Parsing…" : "Click to choose a file"}
        </span>
        <span className="kicker">{accept.replaceAll(".", "").toUpperCase()}</span>
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={handlePick}
          disabled={busy}
        />
      </label>
      {error ? (
        <div className="mt-1 text-[12px] text-[var(--color-oxblood)]">{error}</div>
      ) : null}
    </>
  );
}
