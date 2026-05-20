/**
 * @phase-7 C7 — Mobile polish E2E
 *
 * Covers the cluster's critical-path tests:
 *  - PM-003: FAB → bottom sheet → tap "Neue Ausgabe" → lands on
 *    /app/transactions/neu?kind=ausgabe
 *  - PM-008: Filter chips don't horizontally overflow at 390px
 *  - PM-009: Card variant renders below md; table renders at md+
 *  - Safe-area: bottom nav has env(safe-area-inset-bottom) padding
 *
 * Uses Playwright's iPhone 12 device descriptor for mobile emulation, and
 * the magic-link sign-in shortcut used by all phase-3+ specs.
 */

import { expect, test, devices } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const TEST_ADMIN_EMAIL =
  process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

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

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

// ---------------------------------------------------------------------------
// PM-003: Mobile FAB → bottom sheet → first action reaches its destination
// ---------------------------------------------------------------------------
test.describe("@phase-7 C7 FAB → bottom sheet → Neue Ausgabe", () => {
  test.use({ ...devices["iPhone 12"] });

  test("FAB opens sheet with 4 options; tapping Neue Ausgabe routes correctly", async ({
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
      page.getByRole("menuitem", { name: /Auslage einreichen/i }),
    ).toBeVisible();

    await page.getByRole("menuitem", { name: /Neue Ausgabe/i }).click();

    await expect(page).toHaveURL(/\/app\/transactions\/neu\?kind=ausgabe/);
  });
});

// ---------------------------------------------------------------------------
// PM-008: Filter chips don't horizontally overflow at 390px
// ---------------------------------------------------------------------------
test.describe("@phase-7 C7 filter chips overflow safety", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test("at 390px, all 4 type tabs are reachable and the page does not scroll horizontally", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/transactions");

    // No horizontal page overflow: documentElement scrollWidth <= window width
    const overflowsHorizontally = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(overflowsHorizontally).toBe(false);

    // Each tab is reachable (it might require scrolling inside the chip strip,
    // but the chip strip is overflow-x-auto so .scrollIntoView() works).
    for (const label of ["Alle", "Ausgaben", "Einnahmen", "Spenden"]) {
      const tab = page.getByRole("tab", { name: new RegExp(`^${label}`) });
      await tab.scrollIntoViewIfNeeded();
      await expect(tab).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// PM-009: List card variant renders < md; table renders at md+
// ---------------------------------------------------------------------------
test.describe("@phase-7 C7 list card variant", () => {
  test("on iPhone 12 viewport, TransactionsList renders card variant (no table)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ ...devices["iPhone 12"] });
    const page = await context.newPage();
    await signIn(page);
    await page.goto("/app/transactions");

    // Mobile card list is identified by data-testid; table is hidden on < md.
    const mobileCards = page.locator(
      '[data-testid="transactions-card-list"]',
    );
    await expect(mobileCards).toBeVisible();

    // The desktop <table> is wrapped in a hidden md:block container.
    const desktopTable = page.locator(
      '[data-testid="transactions-table"]',
    );
    await expect(desktopTable).toBeHidden();
    await context.close();
  });

  test("on desktop viewport, TransactionsList renders the table (no cards)", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await signIn(page);
    await page.goto("/app/transactions");

    const desktopTable = page.locator('[data-testid="transactions-table"]');
    await expect(desktopTable).toBeVisible();

    const mobileCards = page.locator(
      '[data-testid="transactions-card-list"]',
    );
    await expect(mobileCards).toBeHidden();
    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Safe-area-inset audit — bottom nav padded for home indicator
// ---------------------------------------------------------------------------
test.describe("@phase-7 C7 safe-area-inset audit", () => {
  test.use({ ...devices["iPhone 12"] });

  test("MobileTabBar nav uses env(safe-area-inset-bottom)", async ({
    page,
  }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Mobile Navigation" });
    await expect(nav).toBeVisible();

    // The class list must include the Tailwind arbitrary value referencing
    // safe-area-inset-bottom — guards against accidental regressions.
    const cls = await nav.getAttribute("class");
    expect(cls).toMatch(/safe-area-inset-bottom/);
  });
});
