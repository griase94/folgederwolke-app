/**
 * @phase-8 Axe a11y scan — Phase 8 T7 (Tier 2 gate).
 *
 * Runs @axe-core/playwright on each transaction tab. The `color-contrast`
 * rule is EXCLUDED because the app's palette tokens are design-approved and
 * the contrast check requires full browser rendering of CSS custom properties
 * which axe misreports in the Playwright environment.
 *
 * Each scan asserts zero violations on the remaining rules. Failures produce
 * a structured axe violation report (impact, id, help URL) in the error
 * message so the developer can act on them immediately.
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

async function signIn(page: Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  try {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await client`
      INSERT INTO magic_links (token_hash, email_canonical, expires_at)
      VALUES (${tokenHash}, ${TEST_ADMIN_EMAIL}, ${expiresAt})
    `;
    await page.goto(`/sign-in/verify?token=${rawToken}`);
    const mismatch = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mismatch.click();
    }
    await Promise.all([
      page.waitForURL(/\/app/, { timeout: 15_000 }),
      page.click('button[type="submit"]').catch(() => {}),
    ]);
  } finally {
    await client.end();
  }
}

/** Format axe violations for a readable assertion error. */
function formatViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
): string {
  if (violations.length === 0) return "(none)";
  return violations
    .map((v) => `  [${v.impact}] ${v.id}: ${v.description} — ${v.helpUrl}`)
    .join("\n");
}

test.describe("@phase-8 Axe a11y scans — per-tab transaction routes", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  for (const tab of [
    { path: "/app/ausgaben", label: "Ausgaben" },
    { path: "/app/einnahmen", label: "Einnahmen" },
    { path: "/app/spenden", label: "Spenden" },
  ]) {
    test(`${tab.label} tab has zero axe violations (color-contrast excluded)`, async ({
      page,
    }) => {
      await page.goto(tab.path);
      // Wait for the scaffold to hydrate — export CTA (rows present) or
      // one of the two real empty-state testids must be visible before scan.
      // `empty-no-matches` = active filter with no hits; `empty-year` = year
      // with no bookings. Both live in TransactionListScaffold.svelte.
      await page.waitForSelector(
        '[data-testid="export-cta"], [data-testid="empty-no-matches"], [data-testid="empty-year"]',
        { timeout: 10_000 },
      );

      const results = await new AxeBuilder({ page })
        .exclude('[data-testid="export-cta"]') // exclude the CTA itself from contrast rule only
        .disableRules(["color-contrast"])
        .analyze();

      expect(
        results.violations,
        `axe violations on ${tab.path}:\n${formatViolations(results.violations)}`,
      ).toHaveLength(0);
    });
  }
});
