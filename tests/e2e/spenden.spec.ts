/**
 * E2E Spenden navigation — @phase-6-spenden
 *
 * Phase 6 (Tier C3) retired the old `/app/transactions/spenden` route +
 * Add/EditSpendeDialog and migrated the tab to the flat `/app/spenden` route
 * (listSpendenPage + the shared Phase-3 scaffold). This spec asserts the new
 * route renders and the old nested route is no longer the legacy dialog page.
 *
 * The deep create / Sachspende-Wertermittlung / Bescheinigung flows live in
 * `tests/e2e/spenden-flow.spec.ts` (also @phase-6-spenden).
 *
 * Tags: @phase-6-spenden
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

test.describe("@phase-6-spenden Spenden — navigation", () => {
  test("unauthenticated /app/spenden redirects to sign-in", async ({
    page,
  }) => {
    await page.goto("/app/spenden");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("authenticated user sees the new /app/spenden list page", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/spenden");
    await expect(
      page.getByRole("heading", { name: "Spenden" }).first(),
    ).toBeVisible();
    // The new flat route uses the shared scaffold + the primary "Neue Spende"
    // CTA, NOT the retired AddSpendeDialog.
    await expect(page.locator('[data-slot="new-cta"]')).toContainText(
      "Neue Spende",
    );
  });

  // Phase 8 T6: /app/transactions/spenden retired → 404 (route group deleted).
  // The assertion (not 200) still holds.
  test("old /app/transactions/spenden returns non-200 (retired)", async ({
    page,
  }) => {
    await signIn(page);
    const resp = await page.goto("/app/transactions/spenden");
    // It must NOT serve the retired legacy page: no Add-Spende dialog trigger
    // and no Aufwandsspende note (both were unique to the deleted route).
    await expect(page.locator('[data-testid="add-spende-btn"]')).toHaveCount(0);
    await expect(
      page.locator('[data-testid="aufwandsspende-note"]'),
    ).toHaveCount(0);
    // The route no longer resolves to a 200 legacy page (it 404s / errors now
    // that the static route is gone — the dynamic [id] segment can't satisfy
    // it with a real donation detail).
    expect(resp?.status()).not.toBe(200);
  });
});
