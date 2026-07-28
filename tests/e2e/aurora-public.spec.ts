import { test, expect } from "@playwright/test";
import {
  seedAuslagenFixtures,
  cleanupAuslagenFixtures,
  SINGLE_ID,
} from "./_helpers/auslagen-fixtures.js";

// @phase-aurora-slice3 — Aurora slice 3: public chrome + Auslage confirmation.
// The A-flow S1 redesign replaced the confirmation page; the header-context and
// share behaviours below are preserved, retargeted onto a seeded AUS-Nr (the
// old blind-render of an unseeded id is gone — the loader 404s unknown ids).

test.beforeAll(async () => {
  await seedAuslagenFixtures();
});
test.afterAll(async () => {
  await cleanupAuslagenFixtures();
});

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

  test("auslage confirmation header offers Vereins-Login", async ({ page }) => {
    await page.goto(`/auslage-eingereicht?id=${SINGLE_ID}`);
    await expect(page.locator('header a[href="/sign-in"]')).toBeVisible();
  });
});

test.describe("@phase-aurora-slice3 Aurora public — Auslage confirmation", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("status link primary, Weitere Auslage secondary, no login CTA in main", async ({
    page,
  }) => {
    await page.goto(`/auslage-eingereicht?id=${SINGLE_ID}`);

    // Success heading + the AUS-Nr are shown; the status CTA leads.
    await expect(page.getByTestId("eingereicht-heading")).toContainText("Anna");
    await expect(page.locator("body")).toContainText(SINGLE_ID);
    await expect(
      page.locator(`a[href*="/auslage-status/${SINGLE_ID}"]`),
    ).toBeVisible();

    // Secondary CTA wording.
    await expect(
      page.locator('main a[href="/auslage-einreichen"]'),
    ).toContainText("Weitere Auslage einreichen");

    // Login is not a success CTA (the shared header link is allowed, the page
    // content must not push it).
    await expect(page.locator('main a[href="/sign-in"]')).toHaveCount(0);
  });

  test("Link speichern falls back to clipboard when navigator.share is unavailable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "share", { value: undefined });
      } catch {
        /* not configurable — fine, most Chromium builds have no share */
      }
    });
    await page.goto(`/auslage-eingereicht?id=${SINGLE_ID}`);
    await page.getByTestId("share-status-link").click();
    await expect(page.getByTestId("share-status-link")).toContainText(
      "Link kopiert",
    );
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`/auslage-status/${SINGLE_ID}`);
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
    await page.goto(`/auslage-eingereicht?id=${SINGLE_ID}`);
    await page.getByTestId("share-status-link").click();
    await expect(page.getByTestId("share-status-link")).toContainText(
      "Link geteilt",
    );
    const shared = await page.evaluate(
      () => (window as unknown as { __shared: { url?: string }[] }).__shared,
    );
    expect(shared[0]?.url).toContain(`/auslage-status/${SINGLE_ID}`);
  });
});
