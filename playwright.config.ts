import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    // Cap each action to avoid hanging on the whisper model download.
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            // Auto-accept camera/mic prompts.
            "--use-fake-ui-for-media-stream",
            // Provide a synthetic video + audio source so getUserMedia returns
            // a real stream rather than failing.
            "--use-fake-device-for-media-stream",
            // Required for some Linux CI runners.
            "--no-sandbox",
          ],
        },
      },
    },
  ],
  webServer: {
    // Reuse an already-running dev server when present; only spawn one as a
    // fallback. Lets you keep `pnpm dev` open in another terminal.
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
