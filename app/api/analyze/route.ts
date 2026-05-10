import { NextRequest, NextResponse } from "next/server";
import { generateObject } from "ai";
import { feedbackSchema } from "@/lib/feedback-schema";

export const runtime = "nodejs";
export const maxDuration = 120;

type Segment = { start: number; end: number; text: string };

type AnalyzeBody = {
  transcript: string;
  segments?: Segment[];
  durationSec: number;
  goal?: string;
  jd?: string;
  cvText?: string;
  prepText?: string;
  stats?: {
    wpm: number;
    fillerPct: number;
    longPauses: number;
    longestPauseSec: number;
  };
  model?: string;
};

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function buildPrompt(body: AnalyzeBody): string {
  const lines: string[] = [];
  lines.push(
    "You are a senior interview coach reviewing a candidate's recorded answer.",
    "Your job: give specific, actionable feedback. Reference concrete moments.",
    "Be honest but generous. Praise what worked, then name the three biggest fixes.",
    "Treat the candidate as a serious professional. No hedging, no padding.",
    "",
    `Recording duration: ${fmt(body.durationSec)} (${body.durationSec.toFixed(1)} seconds).`,
  );
  if (body.stats) {
    lines.push(
      `Measured stats: pace ${body.stats.wpm} wpm, filler ratio ${body.stats.fillerPct}%, ${body.stats.longPauses} long pauses (longest ${body.stats.longestPauseSec.toFixed(1)}s).`,
    );
  }
  if (body.goal) lines.push(`\nGoal stated by candidate:\n${body.goal}`);
  if (body.jd) lines.push(`\nJob description:\n${body.jd}`);
  if (body.cvText) lines.push(`\nCV / résumé:\n${body.cvText}`);
  if (body.prepText)
    lines.push(`\nPrep notes / talking points:\n${body.prepText}`);

  if (body.segments && body.segments.length) {
    lines.push("\nTranscript with timestamps:");
    for (const s of body.segments) {
      lines.push(`[${fmt(s.start)}–${fmt(s.end)}] ${s.text}`);
    }
  } else {
    lines.push("\nTranscript:", body.transcript);
  }

  lines.push(
    "",
    "Now produce feedback as a structured object matching the schema.",
    "Score honestly: a generic answer with three filler clusters is a 6, not an 8.",
    "Reference specific timestamps and phrases from the transcript.",
    "If goal/JD/CV/prep are missing, leave alignmentFeedback as an empty string.",
    "STAR arc: count how many of (Situation, Task, Action, Result) the candidate delivered clearly.",
    "JD keywords: only set if a JD was provided.",
  );
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.transcript || !body.transcript.trim()) {
    return NextResponse.json({ error: "Empty transcript." }, { status: 400 });
  }

  const model = body.model || process.env.ANALYSIS_MODEL || "openai/gpt-5.5";
  const prompt = buildPrompt(body);

  try {
    const { object } = await generateObject({
      model,
      schema: feedbackSchema,
      prompt,
    });
    return NextResponse.json({
      feedback: object,
      modelLabel: model,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Analysis failed: ${(err as Error).message}`,
      },
      { status: 502 },
    );
  }
}
