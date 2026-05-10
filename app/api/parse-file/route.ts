import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Bad multipart payload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB).` },
      { status: 413 },
    );
  }

  const name = file.name || "";
  const lower = name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      await parser.destroy();
      return NextResponse.json({ text: (result.text || "").trim(), name });
    }
    if (
      lower.endsWith(".md") ||
      lower.endsWith(".txt") ||
      file.type.startsWith("text/")
    ) {
      const text = buf.toString("utf8");
      return NextResponse.json({ text: text.trim(), name });
    }
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || lower}` },
      { status: 415 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: `Parse failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
