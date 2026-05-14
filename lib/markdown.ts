import type { Feedback } from "./feedback-schema";

export function feedbackToMarkdown(
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
  if (fb.starArc !== null) lines.push(``, `STAR arc: ${fb.starArc} / 4`);
  if (fb.keyTermsTotal !== null && fb.keyTermsTotal > 0) {
    lines.push(`Key terms: ${fb.keyTermsHit ?? 0} / ${fb.keyTermsTotal}`);
  }
  return lines.join("\n");
}
