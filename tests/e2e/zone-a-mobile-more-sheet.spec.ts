/**
 * Zone-A IA shift — sidebar + mobile + UserMenu coverage (2026-05-21).
 *
 * @phase-7.5 Zone-A
 *
 * - Desktop sidebar promotes Projekte + Jahresabschluss to the main group.
 * - "Audit Inbox" label is renamed to "Belegprüfung" (route unchanged).
 * - /app/sheet-resync is hidden from the sidebar.
 * - Mobile bottom tab bar shows 4 nav tabs + "Mehr" + FAB.
 * - "Mehr" tab opens MoreSheet with the secondary destinations.
 * - Sidebar bottom user-card is now a UserMenu trigger.
 *
 * Auth: same magic-link verify pattern as admin-shell.spec.ts.
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

test.describe("@phase-7.5 Zone-A — IA shift (desktop sidebar)", () => {
  // AdminShell mounts two <Sidebar /> instances side-by-side — one for the
  // tablet (collapsed) breakpoint and one for the desktop breakpoint — and
  // toggles visibility via Tailwind `hidden lg:block` / `block lg:hidden`
  // classes. Both end up in the DOM. We scope to the visible one with a
  // `:visible` pseudo to keep Playwright's strict-mode happy at the lg
  // viewport size we use throughout this file.
  test("main group contains Projekte AND Jahresabschluss", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    const mainGroup = page.locator('[data-nav-group="main"]:visible');
    await expect(mainGroup).toBeVisible();
    await expect(
      mainGroup.getByRole("link", { name: /projekte/i }),
    ).toBeVisible();
    await expect(
      mainGroup.getByRole("link", { name: /jahresabschluss/i }),
    ).toBeVisible();
  });

  test("Belegprüfung label replaces Audit Inbox in the sidebar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    const mainGroup = page.locator('[data-nav-group="main"]:visible');
    await expect(
      mainGroup.getByRole("link", { name: /belegprüfung/i }),
    ).toBeVisible();
    // Old label is gone from the sidebar (the route page may still call
    // itself "Audit Inbox" — that's intentional and out of cluster scope).
    await expect(mainGroup.getByText(/audit inbox/i)).toHaveCount(0);
  });

  test("/app/sheet-resync is NOT linked from the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    const sidebar = page
      .getByRole("complementary", { name: "Hauptnavigation" })
      .locator("visible=true");
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: /sheet[- ]resync/i }),
    ).toHaveCount(0);
  });
});

test.describe("@phase-7.5 Zone-A — mobile tab bar + MoreSheet", () => {
  test("bottom tab bar shows 4 nav links + Mehr trigger + FAB", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);

    const tabBar = page.getByRole("navigation", { name: "Mobile Navigation" });
    await expect(tabBar).toBeVisible();
    // 4 nav links: Übersicht / Projekte / Transaktionen / Belegprüfung.
    await expect(tabBar.getByRole("link")).toHaveCount(4);
    await expect(page.getByTestId("mobile-tab-mehr")).toBeVisible();
    await expect(
      tabBar.getByRole("button", { name: /neu erfassen/i }),
    ).toBeVisible();
  });

  test("Mehr opens MoreSheet with all 6 secondary destinations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);

    await page.getByTestId("mobile-tab-mehr").click();
    const sheet = page.getByTestId("more-sheet");
    await expect(sheet).toBeVisible();
    for (const label of [
      "Mitglieder",
      "Rechnungen",
      "Kunden",
      "Jahresabschluss",
      "Einstellungen",
      "DSGVO",
    ]) {
      await expect(
        sheet.getByRole("menuitem", { name: new RegExp(label, "i") }),
      ).toBeVisible();
    }
  });
});

test.describe("@phase-7.5 Zone-A — sidebar UserMenu", () => {
  test("sidebar user-card opens UserMenu with Einstellungen + Hilfe + Version + Abmelden", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);

    // AdminShell renders two Sidebar instances (tablet + desktop). Only the
    // desktop one is visible at this viewport; scope the testid lookup with
    // `:visible` so strict-mode resolves to a single button.
    const trigger = page.locator(
      '[data-testid="sidebar-user-menu-trigger"]:visible',
    );
    await expect(trigger).toBeVisible();
    await trigger.click();

    await expect(page.getByTestId("user-menu-einstellungen")).toBeVisible();
    await expect(page.getByTestId("user-menu-hilfe")).toBeVisible();
    await expect(page.getByTestId("user-menu-version")).toBeVisible();
    await expect(page.getByTestId("user-menu-abmelden")).toBeVisible();
  });
});
