/**
 * @phase-aurora-slice5
 *
 * Aurora slice 5 — /app/transaktionen unified feed:
 *   - the feed renders rows of all three kinds (showcase corpus, current year);
 *   - chip filtering in place via ?typ= (click Einnahmen → only einnahme rows);
 *   - deep link ?typ=spenden is honored on first load (aria-current chip);
 *   - "Alle" clears the param;
 *   - search drives ?q= and the no-match empty state offers a reset.
 *
 * Desktop viewport here; the mobile tab-bar reachability E2E lives in
 * tests/e2e/aurora-mobile-nav.spec.ts (slice task 5.14).
 */
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@phase-aurora-slice5 Transaktionen feed", () => {
  test("feed renders mixed kinds with month groups and net subtotals", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    // ?year=all: corpus seeds expenses/income in 2026, donations in 2024/2025;
    // ALL_YEARS scope shows all three kinds in the unified feed.
    await page.goto("/app/transaktionen?year=all");
    await expect(
      page.getByRole("heading", { name: "Transaktionen" }),
    ).toBeVisible();
    const rows = page.getByTestId("txn-row");
    expect(await rows.count()).toBeGreaterThan(0);
    // Corpus seeds all three kinds across years — visible under ?year=all.
    for (const kind of ["ausgabe", "einnahme", "spende"]) {
      await expect(
        page.locator(`[data-testid="txn-row"][data-kind="${kind}"]`).first(),
      ).toBeVisible();
    }
    await expect(page.getByTestId("month-subtotal").first()).toBeVisible();
  });

  test("chips filter in place via ?typ=, Alle clears it", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/app/transaktionen");

    await page.getByTestId("filter-chip-einnahmen").click();
    await expect(page).toHaveURL(/typ=einnahmen/);
    const rows = page.getByTestId("txn-row");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i)).toHaveAttribute("data-kind", "einnahme");
    }

    await page.getByTestId("filter-chip-alle").click();
    await expect(page).not.toHaveURL(/typ=/);
  });

  test("deep link ?typ=spenden is honored on first load", async ({ page }) => {
    await loginAs(page, "admin");
    // ?year=all: corpus donations are in 2024/2025; ALL_YEARS makes them visible.
    await page.goto("/app/transaktionen?year=all&typ=spenden");
    await expect(page.getByTestId("filter-chip-spenden")).toHaveAttribute(
      "aria-current",
      "true",
    );
    const rows = page.getByTestId("txn-row");
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i)).toHaveAttribute("data-kind", "spende");
    }
  });

  test("search writes ?q= and a no-match query shows the resettable empty state", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/transaktionen");
    await page.getByTestId("feed-search").fill("zzz-keine-treffer-zzz");
    await expect(page).toHaveURL(/q=zzz-keine-treffer-zzz/, {
      timeout: 5_000,
    });
    await expect(page.getByTestId("feed-empty")).toBeVisible();
    await page.getByRole("link", { name: "Filter zurücksetzen" }).click();
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByTestId("txn-row").first()).toBeVisible();
  });
});
