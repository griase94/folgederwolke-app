import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

/**
 * F1 foundation smoke (@aurora-impl-f1).
 *
 * Behaviour smokes from the F1 acceptance criteria, data-testid / role
 * selectors only (no copy coupling):
 *   1. the brand lockup renders the env-driven Verein name, and
 *   2. the dark-mode toggle applies `.dark` live and the choice survives a
 *      reload (cookie → SSR stamps the class flash-free).
 */
test.describe("@aurora-impl-f1 F1 foundation", () => {
  test("brand lockup renders the env Verein name (not a hardcode)", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    const wordmark = page.getByTestId("brand-wordmark");
    await expect(wordmark).toBeVisible();
    // env VEREIN_NAME in .env.test is "Folge der Wolke e.V. (TEST)"
    await expect(wordmark).toContainText("Folge der Wolke");
    await expect(wordmark).toHaveAttribute("data-env", "VEREIN_NAME");
  });

  test("dark-mode toggle applies .dark, persists across reload, and reverts", async ({
    page,
    context,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/einstellungen");

    const seg = page.getByTestId("mode-segmented");
    await expect(seg).toBeVisible();

    // Switch to Dunkel → the .dark class appears on <html> immediately.
    await seg.locator('[data-value="dark"]').click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    // The choice is mirrored to the fdw_mode cookie …
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "fdw_mode")?.value).toBe("dark");

    // … so it survives a full reload (server stamps .dark into the SSR HTML).
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    // Switching to Hell removes it again (both directions work).
    await page
      .getByTestId("mode-segmented")
      .locator('[data-value="light"]')
      .click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });
});
