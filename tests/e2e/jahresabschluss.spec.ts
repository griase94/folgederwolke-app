/**
 * @phase-6
 *
 * E2E tests for the Jahresabschluss pages.
 *
 * These tests verify the route renders correctly and the Festschreibung
 * modal is accessible. Full DB-backed tests require the test database to
 * have rows for the test year — these tests use the index page which is
 * always available and gracefully handles empty years.
 */

import { expect, test } from "@playwright/test";

test.describe("@phase-6 jahresabschluss", () => {
  test("index page renders with year list", async ({ page }) => {
    const res = await page.goto("/app/jahresabschluss");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Jahresabschluss");
  });

  test("[year] page renders EÜR for current year", async ({ page }) => {
    const year = new Date().getFullYear();
    const res = await page.goto(`/app/jahresabschluss/${year}`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText(`Jahresabschluss ${year}`);
    // EÜR summary section should always render (even with 0 rows)
    await expect(
      page.locator("text=Einnahmen-Überschuss-Rechnung"),
    ).toBeVisible();
  });

  test("[year] page shows all four spheres in EÜR table", async ({ page }) => {
    const year = new Date().getFullYear();
    await page.goto(`/app/jahresabschluss/${year}`);
    await expect(page.locator("text=Ideeller Bereich")).toBeVisible();
    await expect(page.locator("text=Vermögensverwaltung")).toBeVisible();
    await expect(page.locator("text=Zweckbetrieb")).toBeVisible();
    await expect(
      page.locator("text=Wirtschaftlicher Geschäftsbetrieb"),
    ).toBeVisible();
  });

  test("[year] page shows bundle download button", async ({ page }) => {
    const year = new Date().getFullYear();
    await page.goto(`/app/jahresabschluss/${year}`);
    await expect(page.locator("text=Bundle herunterladen")).toBeVisible();
  });

  test("[year] page shows Festschreibung section", async ({ page }) => {
    const year = new Date().getFullYear();
    await page.goto(`/app/jahresabschluss/${year}`);
    await expect(page.locator("text=Jahresabschluss schließen")).toBeVisible();
  });

  test("Festschreibung modal opens on button click", async ({ page }) => {
    const year = new Date().getFullYear();
    await page.goto(`/app/jahresabschluss/${year}`);

    const btn = page.getByRole("button", { name: /Jahresabschluss schließen/ });
    // Button only shows when year is not yet closed
    if (await btn.isVisible()) {
      await btn.click();
      await expect(
        page.locator("text=Jahresabschluss festschreiben?"),
      ).toBeVisible();
      // Cancel dismisses modal
      await page.getByRole("button", { name: "Abbrechen" }).click();
      await expect(
        page.locator("text=Jahresabschluss festschreiben?"),
      ).not.toBeVisible();
    }
  });

  test("gobd-export page renders", async ({ page }) => {
    const year = new Date().getFullYear();
    const res = await page.goto(`/app/jahresabschluss/${year}/gobd-export`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText(`GoBD-Z3 Export ${year}`);
    await expect(page.locator("text=IDEA-Import Anleitung")).toBeVisible();
  });

  test("invalid year returns 400", async ({ page }) => {
    const res = await page.goto("/app/jahresabschluss/1800");
    expect(res?.status()).toBe(400);
  });
});
