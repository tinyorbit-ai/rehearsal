import { expect, test } from "@playwright/test";

const cannedFeedback = {
  feedback: {
    scoreOutOf10: 7.2,
    takeaway: "Solid open, weak landing.",
    strengths: ["Clear narrative", "Confident pace"],
    topFixes: [
      { title: "Cut filler clusters", detail: "Pause instead of 'um'." },
      { title: "Tighten the close", detail: "End on the result." },
      { title: "Slow down at 1:20", detail: "You sped up under pressure." },
    ],
    paceFeedback: "Held 145 wpm; spiked at 1:20.",
    fillerFeedback: "12 'um', 4 'like'.",
    structureFeedback: "STAR S/T/A covered; R was implicit.",
    alignmentFeedback: "",
    rehearsalPrompts: ["Drop the recap.", "Add metrics.", "Pause before the punchline."],
    notableMoments: [
      { time: "0:42", kind: "strong", body: "Named team size explicitly." },
      { time: "1:20", kind: "watch", body: "Three fillers in a row." },
      { time: "2:05", kind: "strong", body: "Closed with measurable impact." },
    ],
    starArc: 3,
    jdKeywordsHit: null,
    jdKeywordsTotal: null,
  },
  modelLabel: "openai/gpt-5.5 (e2e mock)",
  generatedAt: "2026-05-14T12:00:00Z",
};

test.describe("record path", () => {
  test("Start → Recording → Stop transitions through the three views", async ({ page }) => {
    await page.route("**/api/analyze", async (route) => {
      await route.fulfill({ json: cannedFeedback });
    });

    await page.goto("/");

    // Setup → Recording
    await page.getByRole("button", { name: /start recording/i }).click();

    // Verify the live view appears. The masthead label flips to ON AIR and a
    // Stop button replaces Start.
    await expect(page.getByText("ON AIR")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /stop recording/i })).toBeVisible();

    // Let a beat of audio land so MediaRecorder has chunks to emit.
    await page.waitForTimeout(1500);

    // Recording → Analysis
    await page.getByRole("button", { name: /stop recording/i }).click();

    // The Analysis view shows the transcribing loader immediately. We don't
    // wait for whisper to finish (would be minutes on first run); the e2e
    // boundary is "the click wires through and the view transitions".
    await expect(page.getByText("DELIVERY REVIEW")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Transcribing locally/i).or(page.getByText(/Asking the LLM/i)),
    ).toBeVisible();
  });
});
