/**
 * @phase-7 C7 — Mobile polish on iPhone 12 (PM-003 / PM-008 / safe-area)
 *
 * iPhone-12 emulation MUST be applied at the file level — Playwright
 * rejects `test.use({...devices[...]})` inside a `test.describe` group
 * because devices change the worker's defaultBrowserType. The cycle-1
 * spec did this and silently failed to load, so PM-003 (the headline
 * mobile-FAB assertion) had never executed.
 *
 * This file is the iPhone 12 surface area:
 *  - PM-003: FAB → bottom sheet → tap "Neue Einnahme" → lands on the form
 *            with the Einnahme tab pre-selected (aria-pressed="true").
 *  - PM-008: at 390x844 (iPhone 12 logical width), the page does not
 *            horizontally overflow and all 4 type tabs are reachable
 *            via the chip strip's overflow-x scroll.
 *  - PM-009 (mobile half): TransactionsList renders the card variant,
 *            not the table.
 *  - Safe-area-inset: the bottom nav uses the documented .nav-safe-bottom
 *            utility (or equivalent env() padding).
 */

import { expect, test, devices } from "@playwright/test";
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

// ─── File-scope: iPhone 12 emulation applies to every test below ────────
test.use({ ...devices["iPhone 12"] });

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

// Each test sits inside a tagged describe block so the CI grep (and the
// ci-e2e-grep meta-test) can find this file's tag. test.use is FILE-scope
// above; do not move it inside a describe.
test.describe("@phase-7 C7 mobile-polish (iPhone 12)", () => {
  // ---------------------------------------------------------------------------
  // PM-003 — Mobile FAB → bottom sheet → first action reaches its destination
  // ---------------------------------------------------------------------------
  test("PM-003 FAB → bottom sheet → Neue Ausgabe routes correctly", async ({
    page,
  }) => {
    await signIn(page);

    // FAB lives in the bottom nav; it MUST be enabled (was disabled pre-C7).
    const fab = page.getByRole("button", { name: /Neu erfassen/i });
    await expect(fab).toBeVisible();
    await expect(fab).toBeEnabled();
    await expect(fab).toHaveAttribute("aria-haspopup", "menu");

    await fab.click();

    // Sheet now visible with 4 menu items
    await expect(
      page.getByRole("menuitem", { name: /Neue Ausgabe/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Neue Einnahme/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Neue Spende/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Externe Auslage einreichen/i }),
    ).toBeVisible();

    await page.getByRole("menuitem", { name: /Neue Ausgabe/i }).click();

    await expect(page).toHaveURL(/\/app\/transactions\/neu\?kind=ausgabe/);
  });

  // ---------------------------------------------------------------------------
  // PM-003 follow-up (C7-1) — kind= preset wires the form's type tabs
  // ---------------------------------------------------------------------------
  test("PM-003 ?kind=einnahme preselects the Einnahme type tab (C7-1)", async ({
    page,
  }) => {
    await signIn(page);
    // Phase 8 T6: /app/transactions/neu?kind=einnahme → /app/einnahmen/neu
    await page.goto("/app/einnahmen/neu");

    // The form's type-picker MUST reflect the URL kind via aria-pressed.
    const einnahmeTab = page.getByRole("button", { name: /^Einnahme$/i });
    await expect(einnahmeTab).toHaveAttribute("aria-pressed", "true");

    // Sanity: the other tabs are not pressed.
    await expect(
      page.getByRole("button", { name: /^Ausgabe$/i }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByRole("button", { name: /^Spende$/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("PM-003 ?kind=spende preselects the Spende type tab (C7-1)", async ({
    page,
  }) => {
    await signIn(page);
    // Phase 8 T6: /app/transactions/neu?kind=spende → /app/spenden/neu
    await page.goto("/app/spenden/neu");
    await expect(
      page.getByRole("button", { name: /^Spende$/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  // ---------------------------------------------------------------------------
  // PM-008 — Filter chips don't horizontally overflow at iPhone 12 width
  // ---------------------------------------------------------------------------
  // Phase 8 T6: /app/transactions retired → test against /app/ausgaben.
  test("PM-008 at iPhone 12 width, no h-overflow on /app/ausgaben", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben");

    // No horizontal page overflow: documentElement scrollWidth <= window width
    const overflowsHorizontally = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(overflowsHorizontally).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // PM-009 — TransactionsList renders the card variant on mobile (no table)
  // ---------------------------------------------------------------------------
  // Phase 8 T6: /app/transactions retired → test against /app/ausgaben.
  test("PM-009 on iPhone 12, Ausgaben renders card variant (no table)", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/ausgaben");

    // Mobile card list is identified by data-testid; table is hidden on < md.
    const mobileCards = page.locator('[data-testid="transactions-card-list"]');
    await expect(mobileCards).toBeVisible();

    // The desktop <table> is wrapped in a hidden md:block container.
    const desktopTable = page.locator('[data-testid="transactions-table"]');
    await expect(desktopTable).toBeHidden();
  });

  // ---------------------------------------------------------------------------
  // Safe-area-inset audit — bottom nav padded for home indicator
  // ---------------------------------------------------------------------------
  test("MobileTabBar uses safe-area-inset-bottom padding", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Mobile Navigation" });
    await expect(nav).toBeVisible();

    // Either the documented .nav-safe-bottom class OR the Tailwind arbitrary
    // value referencing the env() inset. The cycle-2 cleanup (C7-9) drops the
    // arbitrary value in favour of the class, so this regex tolerates both.
    const cls = await nav.getAttribute("class");
    expect(cls).toMatch(/(\bnav-safe-bottom\b|safe-area-inset-bottom)/);
  });

  // ---------------------------------------------------------------------------
  // /app smoke — no horizontal overflow on iPhone 12
  // ---------------------------------------------------------------------------
  test("/app renders with no horizontal overflow on iPhone 12", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app");

    const overflows = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(overflows, "iPhone 12 should not horizontally overflow").toBe(false);

    await expect(
      page.getByRole("navigation", { name: "Mobile Navigation" }),
    ).toBeVisible();
  });
});
