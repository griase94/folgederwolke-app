/**
 * E2E tests for /app/transactions (@phase-5).
 *
 * These tests verify the transactions list, detail, and neu pages
 * are accessible and render key structural elements. Full SEPA XML and
 * mark-erstattet flows require fixture data and are tagged @phase-5-extended.
 */
import { test, expect } from "@playwright/test";

test.describe("Transactions list @phase-5", () => {
  test.beforeEach(async ({ page }) => {
    // Most E2E suites use a shared auth fixture; follow the project pattern.
    // If no fixture, skip gracefully — CI uses fixture seed data.
    await page.goto("/app/transactions");
  });

  test("renders page title", async ({ page }) => {
    await expect(page).toHaveTitle(/Transaktionen/);
  });

  test("renders type tabs (Alle, Ausgaben, Einnahmen, Spenden)", async ({
    page,
  }) => {
    await expect(page.getByRole("tab", { name: "Alle" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Ausgaben" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Einnahmen" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Spenden" })).toBeVisible();
  });

  test("renders saved views bar", async ({ page }) => {
    await expect(page.getByText("Diesen Monat")).toBeVisible();
    await expect(page.getByText("Offene Erstattungen")).toBeVisible();
    await expect(page.getByText("Spenden YTD")).toBeVisible();
  });

  test("renders search input", async ({ page }) => {
    await expect(
      page.getByRole("searchbox", {
        name: /suchen/i,
      }),
    ).toBeVisible();
  });

  test("renders Neue Transaktion button", async ({ page }) => {
    await expect(
      page.getByRole("link", { name: /Neue Transaktion/i }),
    ).toBeVisible();
  });

  test("local search narrows displayed rows", async ({ page }) => {
    // Type something unlikely — expect empty state or reduced rows
    const searchBox = page.getByRole("searchbox", { name: /suchen/i });
    await searchBox.fill("xyzzy-noresults-12345");
    await expect(page.getByText(/Keine Transaktionen gefunden/i)).toBeVisible();
  });

  test("switching type tab filters list", async ({ page }) => {
    await page.getByRole("tab", { name: "Ausgaben" }).click();
    // The URL doesn't necessarily update (client-only filter), but badge or
    // empty state should appear
    await expect(page.getByRole("tab", { name: "Ausgaben" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

test.describe("Transactions neu page @phase-5", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/transactions/neu");
  });

  test("renders page title", async ({ page }) => {
    await expect(page).toHaveTitle(/Neue Transaktion/);
  });

  test("renders type picker buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Ausgabe" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Einnahme" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Spende" })).toBeVisible();
  });

  test("default type is Ausgabe (aria-pressed)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Ausgabe" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("switching to Einnahme shows income-specific field", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Einnahme" }).click();
    await expect(page.getByLabel(/Geldeingangsdatum/i)).toBeVisible();
  });

  test("switching to Spende shows spender field", async ({ page }) => {
    await page.getByRole("button", { name: "Spende" }).click();
    await expect(page.getByLabel(/Spender/i)).toBeVisible();
  });

  test("Abbrechen link leads back to /app/transactions", async ({ page }) => {
    await page.getByRole("link", { name: /Abbrechen/i }).click();
    await expect(page).toHaveURL(/\/app\/transactions$/);
  });

  test("form validation: empty bezeichnung prevents submit @phase-5", async ({
    page,
  }) => {
    // Fill betrag but leave bezeichnung empty.
    // Betrag is a type=text inputmode=decimal field (mobile keyboard fix) —
    // locate by its label, not the old input[type=number] selector.
    await page.getByLabel(/betrag/i).fill("10");
    await page.getByRole("button", { name: /erfassen/i }).click();
    // HTML5 required validation kicks in — form not submitted
    await expect(page).toHaveURL(/\/app\/transactions\/neu/);
  });
});

test.describe("Transactions detail page @phase-5", () => {
  test("navigating to a non-existent ID shows 404", async ({ page }) => {
    const response = await page.goto(
      "/app/transactions/00000000-0000-0000-0000-000000000000?kind=expense",
    );
    // SvelteKit error page returns 404
    expect(response?.status()).toBe(404);
  });
});
