/**
 * E2E - chip drilldown @phase-6
 *
 * Browses /app/rechnungen?status=offen&year=<current> and asserts that the
 * "active filter" banner shows up. We don't seed paid + unpaid invoices in
 * this spec — the route-level behaviour (status reaches the page, banner
 * renders) is the value here; row-level filtering is covered by the unit
 * test against listInvoices.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
  `;
  await client.end();

  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mismatch.click();
  }
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-6 Rechnungen filter chip", () => {
  test("?status=offen&year=2026 shows an active-filter banner", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/rechnungen?status=offen&year=2026");
    await expect(page).toHaveURL(/status=offen/);
    const banner = page.getByTestId("rechnungen-active-filter");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/offen/i);
    await expect(banner).toContainText("2026");
    // The reset link works — should land on the bare /app/rechnungen.
    await page.getByTestId("rechnungen-clear-filter").click();
    await expect(page).toHaveURL(/\/app\/rechnungen$/);
    await expect(page.getByTestId("rechnungen-active-filter")).toHaveCount(0);
  });

  test("no params → no active-filter banner", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/rechnungen");
    await expect(page.getByTestId("rechnungen-active-filter")).toHaveCount(0);
  });
});
