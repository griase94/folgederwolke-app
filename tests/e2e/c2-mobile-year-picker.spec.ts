/**
 * C2 cycle 3 — mobile <sm year-picker variant.
 *
 * At iPhone-12 width (390x844), the desktop SegmentedControl is hidden
 * (`hidden sm:block`) — without a mobile alternative there is no way to
 * switch Buchungsjahr on a phone. This spec asserts that a compact year
 * picker is visible and tappable on iPhone-12 emulation, and that
 * selecting a year updates the URL to `?year=NNNN`.
 *
 * Resolves: C2-4 (julia P1 + UX-1 blocker).
 *
 * Uses the same SSR-crash mitigation as c2-year-switcher.spec.ts —
 * describe.serial + one test per server boot.
 */

import { expect, test, devices } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

test.use({ ...devices["iPhone 12"] });

async function signIn(page: import("@playwright/test").Page): Promise<void> {
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
    VALUES (${tokenHash}, ${TEST_ADMIN_EMAIL}, ${expiresAt})
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

test.describe.serial(
  "@phase-2 @overnight-c2 mobile year picker (C2-4)",
  () => {
    test("mobile <sm year-picker is visible + selecting a year updates the URL", async ({
      page,
    }) => {
      await signIn(page);

      await page.goto("/app");
      if (page.url().includes("/sign-in")) test.skip();

      // (1) Mobile picker is visible at iPhone-12 width.
      const mobile = page.locator('[data-fdw="year-switcher-mobile"]');
      await expect(mobile).toBeVisible();

      // (2) The desktop SegmentedControl wrap is hidden at iPhone-12 width.
      // Use `toBeHidden` rather than `toHaveCount(0)` because the markup
      // remains in the DOM, just hidden via `hidden sm:block`.
      const desktop = page.locator('[data-fdw="year-switcher-wrap"]');
      if ((await desktop.count()) > 0) {
        await expect(desktop.first()).toBeHidden();
      }

      // (3) The picker exposes a native <select> with at least one option.
      const select = mobile.locator("select");
      await expect(select).toBeVisible();
      const options = await select
        .locator("option")
        .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
      expect(options.length).toBeGreaterThan(0);

      // (4) Selecting a year updates ?year= in the URL.
      const targetValue = options[0]!;
      await select.selectOption(targetValue);
      await page.waitForURL(new RegExp(`year=${targetValue}`), {
        timeout: 5_000,
      });
      expect(page.url()).toMatch(new RegExp(`year=${targetValue}`));
    });
  },
);
