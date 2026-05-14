// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above top-level consts; vi.hoisted runs alongside it
// so the factory closure can reach these refs.
const { getTextMock, destroyMock } = vi.hoisted(() => ({
  getTextMock: vi.fn(),
  destroyMock: vi.fn(),
}));

// Plain function constructor — vi.fn().mockImplementation isn't reliably
// constructable with `new`, which is how the route invokes PDFParse.
vi.mock("pdf-parse", () => ({
  PDFParse: function MockPDFParse() {
    return { getText: getTextMock, destroy: destroyMock };
  },
}));

import { POST } from "./route";

function form(fields: Record<string, Blob | string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return new Request("http://localhost/api/parse-file", { method: "POST", body: fd });
}

describe("POST /api/parse-file", () => {
  beforeEach(() => {
    getTextMock.mockReset();
    destroyMock.mockReset();
  });

  it("returns 400 when the body is not multipart", async () => {
    const res = await POST(
      new Request("http://localhost/api/parse-file", {
        method: "POST",
        body: "not multipart",
        headers: { "content-type": "text/plain" },
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad multipart payload." });
  });

  it("returns 400 when no file field is present", async () => {
    const res = await POST(form({ other: "value" }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing 'file' field." });
  });

  it("returns 413 when the file exceeds 5MB", async () => {
    const big = new File(["x".repeat(5 * 1024 * 1024 + 1)], "big.txt", {
      type: "text/plain",
    });
    const res = await POST(form({ file: big }) as never);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too large/i);
  });

  it("returns 415 for unsupported types", async () => {
    const f = new File([new Uint8Array([0x00, 0x01, 0x02])], "thing.bin", {
      type: "application/octet-stream",
    });
    const res = await POST(form({ file: f }) as never);
    expect(res.status).toBe(415);
    expect((await res.json()).error).toMatch(/unsupported/i);
  });

  it("reads .txt files as UTF-8 and trims", async () => {
    const f = new File(["  hello world  \n"], "notes.txt", { type: "text/plain" });
    const res = await POST(form({ file: f }) as never);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { text: string; name: string };
    expect(data.text).toBe("hello world");
    expect(data.name).toBe("notes.txt");
  });

  it("reads .md files even when MIME is empty", async () => {
    // Some browsers send empty MIME for .md
    const f = new File(["# Heading\n\nbody"], "story.md", { type: "" });
    const res = await POST(form({ file: f }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe("# Heading\n\nbody");
  });

  it("accepts any text/* MIME type as text", async () => {
    const f = new File(["plain content"], "no-extension", { type: "text/csv" });
    const res = await POST(form({ file: f }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe("plain content");
  });

  it("delegates .pdf parsing to pdf-parse and returns the text", async () => {
    getTextMock.mockResolvedValueOnce({ text: "  extracted from pdf  " });
    const f = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "cv.pdf", {
      type: "application/pdf",
    });
    const res = await POST(form({ file: f }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe("extracted from pdf");
    expect(getTextMock).toHaveBeenCalledOnce();
    expect(destroyMock).toHaveBeenCalledOnce();
  });

  it("detects PDFs by extension when MIME is wrong", async () => {
    getTextMock.mockResolvedValueOnce({ text: "ok" });
    const f = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "resume.pdf", {
      type: "application/octet-stream",
    });
    const res = await POST(form({ file: f }) as never);
    expect(res.status).toBe(200);
    expect(getTextMock).toHaveBeenCalledOnce();
  });

  it("returns 500 when the PDF parser throws", async () => {
    getTextMock.mockRejectedValueOnce(new Error("corrupted xref"));
    const f = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "bad.pdf", {
      type: "application/pdf",
    });
    const res = await POST(form({ file: f }) as never);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("corrupted xref");
  });

  it("returns an empty string when the PDF has no text", async () => {
    getTextMock.mockResolvedValueOnce({ text: "" });
    const f = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "empty.pdf", {
      type: "application/pdf",
    });
    const res = await POST(form({ file: f }) as never);
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe("");
  });
});
