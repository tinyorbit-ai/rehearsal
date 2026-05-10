import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
// Long pulls — accommodate up to ~25 min of audio.
export const maxDuration = 300;

export type TranscribeSegment = {
  start: number;
  end: number;
  text: string;
  avgLogprob?: number;
  noSpeechProb?: number;
  source: "cloud";
};

export type TranscribeResponse = {
  text: string;
  duration: number;
  segments: TranscribeSegment[];
};

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set on the server." },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `Bad multipart payload: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.set("file", file, file.name || "audio.webm");
  upstream.set("model", MODEL);
  upstream.set("response_format", "verbose_json");
  upstream.set("timestamp_granularities[]", "segment");
  upstream.set("temperature", "0");
  // English-only by default; let the caller override.
  const lang = form.get("language");
  if (typeof lang === "string" && lang) upstream.set("language", lang);

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstream,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Groq ${res.status}: ${detail.slice(0, 500)}` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    text: string;
    duration: number;
    segments?: Array<{
      start: number;
      end: number;
      text: string;
      avg_logprob?: number;
      no_speech_prob?: number;
    }>;
  };

  const segments: TranscribeSegment[] = (data.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: (s.text || "").trim(),
    avgLogprob: s.avg_logprob,
    noSpeechProb: s.no_speech_prob,
    source: "cloud",
  }));

  const out: TranscribeResponse = {
    text: data.text || segments.map((s) => s.text).join(" "),
    duration: data.duration ?? 0,
    segments,
  };
  return NextResponse.json(out);
}
