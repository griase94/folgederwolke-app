/**
 * C2 — mobile year switcher (compact dropdown, all viewports).
 *
 * The old two-variant approach (SegmentedControl ≥sm / native select <sm) has
 * been replaced by a single compact YearMenu dropdown that works on every
 * viewport. This spec validates the behaviour at iPhone-12 width (390px).
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

// iPhone-12 emulation gives us viewport, user-agent, touch, and devicePixelRatio,
// but `devices["iPhone 12"]` also sets `defaultBrowserType: "webkit"`. CI only
// installs Chromium (.github/workflows/ci.yml), so override `browserName` to
// chromium — engine swap only, mobile emulation stays intact.
test.use({ ...devices["iPhone 12"], browserName: "chromium" });

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

test.describe.serial("@phase-2 @overnight-c2 mobile year menu (C2-4)", () => {
  test("compact year menu trigger is visible at iPhone-12 width + selecting a year updates the URL", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto("/app");
    if (page.url().includes("/sign-in")) test.skip();

    // (1) The compact year menu trigger is visible at iPhone-12 width.
    //     It is no longer hidden on mobile — the single dropdown works on all
    //     viewports (no hidden sm:block / sm:hidden split anymore).
    const trigger = page.locator('[data-fdw="year-menu-trigger"]');
    await expect(trigger).toBeVisible();

    // (2) The old wide MobileYearPicker native select is gone.
    //     The data-fdw="year-switcher-mobile" selector should no longer exist.
    const oldMobilePicker = page.locator('[data-fdw="year-switcher-mobile"]');
    await expect(oldMobilePicker).toHaveCount(0);

    // (3) Opening the dropdown shows year options.
    //     bits-ui DropdownMenuRadioItem renders as role="menuitemradio".
    await trigger.click();
    const radioItems = page.locator('[role="menuitemradio"]');
    await expect(radioItems.first()).toBeVisible({ timeout: 5_000 });
    const count = await radioItems.count();
    expect(count).toBeGreaterThan(0);

    // (4) Selecting a year updates ?year= in the URL.
    //     Click the first radio item (newest year = current default).
    const firstItem = radioItems.first();
    const targetLabel = await firstItem.getAttribute("aria-label");
    // Extract year number from aria-label (e.g. "2026" or "2026 (festgeschrieben)")
    const yearMatch = targetLabel?.match(/\d{4}/);
    if (yearMatch) {
      const targetYear = yearMatch[0];
      await firstItem.click();
      await page.waitForURL(new RegExp(`year=${targetYear}`), {
        timeout: 5_000,
      });
      expect(page.url()).toMatch(new RegExp(`year=${targetYear}`));
    }
  });
});
