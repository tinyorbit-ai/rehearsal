import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("the page loads with the masthead and Start button", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "The Rehearsal" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /start recording/i }),
    ).toBeVisible();

    // No unhandled runtime errors during initial render. (Network errors from
    // background model downloads will surface as fetch failures, not console
    // errors; the relevant guard is uncaught JS exceptions only.)
    const fatal = consoleErrors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("Download the React DevTools"),
    );
    expect(fatal).toEqual([]);
  });

  test("the masthead section label says PREPARATION on the setup view", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("PREPARATION")).toBeVisible();
  });

  test("the preparation drawer is reachable and editable", async ({ page }) => {
    await page.goto("/");
    const goal = page.getByPlaceholder(/what are you rehearsing for/i);
    await goal.fill("Staff eng loop");
    await expect(goal).toHaveValue("Staff eng loop");
  });
});
