"use client";

import { useState } from "react";

export type Prep = {
  goal: string;
  jd: string;
  cvText: string;
  cvName: string;
  prepText: string;
  prepName: string;
};

export const EMPTY_PREP: Prep = {
  goal: "",
  jd: "",
  cvText: "",
  cvName: "",
  prepText: "",
  prepName: "",
};

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

  return (
    <section
      className={`border-t border-[var(--color-ink-2)] ${compact ? "opacity-60 pointer-events-none" : ""}`}
    >
      <div className="mx-auto max-w-[1240px] px-6 py-8">
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Preparation
            </h2>
            <p className="text-sm text-[var(--color-paper-2)] mt-1">
              Optional. The more you give, the sharper the feedback.
            </p>
          </div>
          <div className="kicker">All fields optional</div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Goal" hint="One line. e.g. ‘Staff eng loop at Stripe’.">
            <input
              type="text"
              value={value.goal}
              onChange={(e) => set("goal", e.target.value)}
              placeholder="What are you rehearsing for?"
              className="field w-full px-3 py-2.5 rounded-none font-sans text-sm"
            />
          </Field>

          <Field label="Job description" hint="Paste the JD. Used for alignment scoring.">
            <textarea
              rows={3}
              value={value.jd}
              onChange={(e) => set("jd", e.target.value)}
              placeholder="Paste the JD here…"
              className="field w-full px-3 py-2.5 rounded-none font-sans text-sm resize-y"
            />
          </Field>

          <Field
            label="CV / résumé"
            hint="PDF, Markdown, or plain text. Parsed once and held in memory."
          >
            <FileField
              accept=".pdf,.md,.txt"
              fileName={value.cvName}
              charCount={value.cvText.length}
              onParsed={(text, name) => onChange({ ...value, cvText: text, cvName: name })}
              onClear={() => onChange({ ...value, cvText: "", cvName: "" })}
            />
          </Field>

          <Field
            label="Prep doc"
            hint="STAR stories, talking points, notes. We’ll check whether you hit them."
          >
            <FileField
              accept=".pdf,.md,.txt"
              fileName={value.prepName}
              charCount={value.prepText.length}
              onParsed={(text, name) =>
                onChange({ ...value, prepText: text, prepName: name })
              }
              onClear={() => onChange({ ...value, prepText: "", prepName: "" })}
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
