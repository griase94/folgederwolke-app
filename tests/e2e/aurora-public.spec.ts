import { test, expect } from "@playwright/test";

// @phase-aurora-slice3 — Aurora slice 3: public chrome + Auslage success page.
// Spec: docs/superpowers/specs/2026-06-11-aurora-ui-redesign-design.md §6.

test.describe("@phase-aurora-slice3 Aurora public — header context actions", () => {
  test("sign-in header offers Auslage einreichen", async ({ page }) => {
    await page.goto("/sign-in");
    const action = page.locator('header a[href="/auslage-einreichen"]');
    await expect(action).toBeVisible();
    await expect(action).toContainText("Auslage einreichen");
  });

  test("auslage form header offers Vereins-Login", async ({ page }) => {
    await page.goto("/auslage-einreichen");
    const action = page.locator('header a[href="/sign-in"]');
    await expect(action).toBeVisible();
    await expect(action).toContainText("Vereins-Login");
  });

  test("auslage success page header offers Vereins-Login", async ({ page }) => {
    await page.goto("/auslage-eingereicht?id=AUS-2026-001");
    await expect(page.locator('header a[href="/sign-in"]')).toBeVisible();
  });
});

test.describe("@phase-aurora-slice3 Aurora public — Auslage success page", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("status link primary, expectation sentence, Weitere Auslage, no login CTA in main", async ({
    page,
  }) => {
    await page.goto("/auslage-eingereicht?id=AUS-2026-001");

    // Status link leads (existing auslagen.spec.ts contract preserved).
    const statusLink = page.locator('a[href*="/auslage-status/AUS-2026-001"]');
    await expect(statusLink).toBeVisible();
    await expect(page.locator("body")).toContainText("AUS-2026-001");

    // Expectation sentence verbatim (spec §6 — binding).
    await expect(
      page.getByText(
        "Der Vorstand prüft deine Auslage. Sobald sie freigegeben ist, wird der Betrag überwiesen — den Stand siehst du jederzeit unter deinem Status-Link.",
      ),
    ).toBeVisible();

    // Secondary CTA wording.
    await expect(
      page.locator('main a[href="/auslage-einreichen"]'),
    ).toContainText("Weitere Auslage einreichen");

    // Login is not a success CTA (the shared header link is allowed,
    // the page content must not push it).
    await expect(page.locator('main a[href="/sign-in"]')).toHaveCount(0);
  });

  test("Link speichern falls back to clipboard when navigator.share is unavailable", async ({
    page,
  }) => {
    // Force the no-share path deterministically (desktop Chromium on macOS
    // may or may not expose navigator.share depending on version).
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "share", { value: undefined });
      } catch {
        /* not configurable — fine, most Chromium builds have no share */
      }
    });
    await page.goto("/auslage-eingereicht?id=AUS-2026-001");
    await page.getByTestId("share-status-link").click();
    await expect(page.getByTestId("share-status-link")).toContainText(
      "Link kopiert",
    );
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("/auslage-status/AUS-2026-001");
  });

  test("Link speichern uses navigator.share when available", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shared: unknown[] }).__shared = [];
      Object.defineProperty(navigator, "share", {
        value: (data: unknown) => {
          (window as unknown as { __shared: unknown[] }).__shared.push(data);
          return Promise.resolve();
        },
      });
    });
    await page.goto("/auslage-eingereicht?id=AUS-2026-001");
    await page.getByTestId("share-status-link").click();
    await expect(page.getByTestId("share-status-link")).toContainText(
      "Link geteilt",
    );
    const shared = await page.evaluate(
      () => (window as unknown as { __shared: { url?: string }[] }).__shared,
    );
    expect(shared[0]?.url).toContain("/auslage-status/AUS-2026-001");
  });
});
