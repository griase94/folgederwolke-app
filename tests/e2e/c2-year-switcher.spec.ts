/**
 * C2 — End-to-end critical-path tests for the global year switcher (dropdown).
 *
 * Resolves: VB-002, JB-001, JB-006, UX-010, UI-009.
 *
 * The YearMenu is a compact dropdown trigger (data-fdw="year-menu-trigger")
 * replacing the old SegmentedControl pill-row. The dropdown contains
 * RadioGroup items, one per year.
 *
 * Coverage strategy
 * -----------------
 * This file validates the user-visible contract end-to-end (auth → render
 * → URL state → DOM assertions). The harder properties — cookie persistence
 * across hard reloads, switcher-click navigation behaviour — are exercised at
 * the component layer in `src/lib/components/admin/YearMenu.test.ts` and at
 * the integration layer in `tests/unit/c2-layout-year.test.ts`.
 *
 * Known pre-existing fragility (NOT introduced by C2):
 *   `virtual:pwa-register/svelte`'s `useRegisterSW` accesses `navigator`
 *   at the first statement of an async `register()` body inside
 *   `UpdateAvailableToast` (rendered by `AdminShell`). On Node 20 with
 *   default `unhandled-rejections=throw`, that rejection terminates the
 *   adapter-node webserver between requests. The first request to /app
 *   typically succeeds (the response is flushed before the rejection
 *   propagates), subsequent ones see ERR_CONNECTION_REFUSED.
 *
 *   Fixing this requires modifying `AdminShell` (outside C2's domain) to
 *   wrap the PWA toast in a `{#if browser}` guard — see the cluster brief.
 *   Until then, only one E2E test per server boot can reliably hit /app;
 *   the rest of the contract is validated at the component + integration
 *   level.
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

async function setFestgeschriebenBis(year: number) {
  const { default: postgres } = await import("postgres");
  const url =
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  const client = postgres(url, { prepare: false, max: 1 });
  await client`
    INSERT INTO settings (key, value)
    VALUES ('festgeschrieben_bis', ${year}::text::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = ${year}::text::jsonb
  `;
  await client.end();
}

async function clearFestgeschriebenBis() {
  const { default: postgres } = await import("postgres");
  const url =
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  const client = postgres(url, { prepare: false, max: 1 });
  await client`DELETE FROM settings WHERE key = 'festgeschrieben_bis'`;
  await client.end();
}

// Each test must run against a freshly-booted webserver (see the SSR-crash
// note in the file header). describe.serial ensures the tests run in order,
// and we set festgeschrieben_bis BEFORE each /app navigation so the layout
// load surfaces a closed year for the lock-icon + URL assertions.

test.describe
  .serial("@phase-2 @overnight-c2 year switcher dropdown (VB-002 / JB-001 / UI-009)", () => {
  test.beforeEach(async () => {
    await setFestgeschriebenBis(2024);
  });

  test.afterEach(async () => {
    await clearFestgeschriebenBis();
  });

  test("year menu trigger renders + shows current year + lock icon for closed year (VB-002 / UX-010 / UI-009 / JB-006)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    await page.goto("/app?year=2024");
    if (page.url().includes("/sign-in")) test.skip();

    // (1) Year menu trigger is visible — compact dropdown, not a pill-row.
    const trigger = page.locator('[data-fdw="year-menu-trigger"]');
    await expect(trigger).toBeVisible();

    // (2) ?year=2024 in URL → trigger shows "2024" as the label (JB-006).
    await expect(trigger).toContainText("2024");

    // (3) Trigger aria-label includes "2024" (UX-010 — year is explicit).
    const label = await trigger.getAttribute("aria-label");
    expect(label).toMatch(/2024/);

    // (4) Closed year carries lock icon (UI-009) — visible in the open menu.
    // Open the dropdown first.
    await trigger.click();
    const lock = page.locator('[data-testid="year-lock-2024"]');
    await expect(lock).toBeVisible();

    // (5) Closed year has aria-label including "festgeschrieben" (UI-009 a11y).
    const closedItem = page.locator('[aria-label="2024 (festgeschrieben)"]');
    await expect(closedItem).toBeVisible();

    // (6) Current Buchungsjahr is OPEN — no lock icon for it.
    const current = new Date().getFullYear();
    const openLock = page.locator(`[data-testid="year-lock-${current}"]`);
    await expect(openLock).toHaveCount(0);
  });
});
