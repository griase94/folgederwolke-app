/**
 * @phase-aurora-slice5
 *
 * THE original bug this redesign started from: on mobile, Einnahmen + Spenden
 * were unreachable (no tab, MoreSheet omitted them). This spec pins the fix:
 * the Transaktionen tab opens the unified feed, and the Einnahmen/Spenden
 * chips surface those records on a phone viewport.
 *
 * iPhone 15 Pro Max logical viewport (430×932).
 */
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

test.use({ viewport: { width: 430, height: 932 } });

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

test.describe("@phase-aurora-slice5 mobile nav reaches all transaction types", () => {
  test("tab bar Transaktionen → /app/transaktionen; Einnahmen + Spenden reachable via chips", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app");

    // The bottom tab bar cell (sidebar is hidden at 430px).
    const tab = page.getByRole("link", { name: "Transaktionen" }).first();
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page).toHaveURL(/\/app\/transaktionen/);

    // Navigate with year=all so the corpus (donations in 2024/2025) is visible.
    // The tab-href flip is already verified above; here we test chip reachability.
    await page.goto("/app/transaktionen?year=all");

    // Einnahmen reachable (was: impossible on mobile).
    await page.getByTestId("filter-chip-einnahmen").click();
    await expect(page).toHaveURL(/typ=einnahmen/);
    await expect(
      page.locator('[data-testid="txn-row"][data-kind="einnahme"]').first(),
    ).toBeVisible();

    // Spenden reachable (was: impossible on mobile).
    await page.getByTestId("filter-chip-spenden").click();
    await expect(page).toHaveURL(/typ=spenden/);
    await expect(
      page.locator('[data-testid="txn-row"][data-kind="spende"]').first(),
    ).toBeVisible();

    // A row opens its per-type detail.
    await page
      .locator('[data-testid="txn-row"][data-kind="spende"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/spenden\/[0-9a-f-]+$/);
  });
});
