/**
 * @phase-7 C7 — PM-009 desktop half
 *
 * At desktop viewport (≥ md), the TransactionsList renders the table
 * variant; the mobile card list is hidden.
 *
 * Uses Playwright's default desktop chromium project (no per-file
 * device emulation — this test is the inverse case to the iPhone 12
 * spec's PM-009 check).
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

async function signIn(
  page: import("@playwright/test").Page,
  email: string = TEST_ADMIN_EMAIL,
): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);

  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${email}, ${expiresAt})
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

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test("@phase-7 PM-009 on desktop viewport, TransactionsList renders the table (no cards)", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/app/transactions");

  const desktopTable = page.locator('[data-testid="transactions-table"]');
  await expect(desktopTable).toBeVisible();

  const mobileCards = page.locator('[data-testid="transactions-card-list"]');
  await expect(mobileCards).toBeHidden();
});
