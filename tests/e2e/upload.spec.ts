import { expect, test } from "@playwright/test";

test.describe("upload path", () => {
  test("picking a video file transitions to the analysis view", async ({ page }) => {
    await page.route("**/api/analyze", async (route) => {
      await route.fulfill({
        json: {
          feedback: {
            scoreOutOf10: 5,
            takeaway: "Upload-path canned response.",
            strengths: ["a", "b"],
            topFixes: [
              { title: "1", detail: "x" },
              { title: "2", detail: "y" },
              { title: "3", detail: "z" },
            ],
            paceFeedback: "p",
            fillerFeedback: "f",
            structureFeedback: "s",
            alignmentFeedback: "",
            rehearsalPrompts: ["a", "b", "c"],
            notableMoments: [
              { time: "0:01", kind: "strong", body: "x" },
              { time: "0:02", kind: "watch", body: "y" },
              { time: "0:03", kind: "strong", body: "z" },
            ],
            starArc: 2,
            jdKeywordsHit: null,
            jdKeywordsTotal: null,
          },
          modelLabel: "mocked",
          generatedAt: "2026-05-14T12:00:00Z",
        },
      });
    });

    await page.goto("/");

    // The video input is a hidden file input rendered next to the camera
    // preview. setInputFiles works on hidden inputs.
    const fileInput = page.locator('input[type="file"][accept^="video"]');

    // Provide a placeholder file. Real decoding will fail downstream, but the
    // wiring through handleUpload → analysis view is what we verify here.
    await fileInput.setInputFiles({
      name: "sample.webm",
      mimeType: "video/webm",
      buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), // EBML magic; minimal placeholder
    });

    await expect(page.getByText("DELIVERY REVIEW")).toBeVisible({ timeout: 15_000 });
    // Either the transcribing loader, the analyzing loader, or an error block
    // is acceptable here — the placeholder file may fail to decode.
    await expect(
      page
        .getByText(/Transcribing locally/i)
        .or(page.getByText(/Asking the LLM/i))
        .or(page.getByText(/Transcription failed/i)),
    ).toBeVisible();
  });
});
