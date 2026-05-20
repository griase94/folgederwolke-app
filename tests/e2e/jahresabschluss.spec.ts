/**
 * @phase-6
 *
 * E2E tests for the Jahresabschluss tabbed workspace (C1 cycle 2 redesign).
 *
 * Pre-C1 these tests did unauthenticated page.goto() and ended up at
 * /sign-in (they were already red on main). C1 cycle 2 reuses the
 * rechnungen.spec.ts signIn() helper + updates locators to the new
 * Workspace-Tabs UI:
 *   - "Bundle herunterladen" → "Steuerberater-Paket"
 *   - "Einnahmen-Überschuss-Rechnung" → "Sphären-Übersicht"
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

test.describe("@phase-6 jahresabschluss", () => {
  test("index page renders with year list", async ({ page }) => {
    await signIn(page);
    const res = await page.goto("/app/jahresabschluss");
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("Jahresabschluss");
  });

  test("[year] workspace renders + Sphären-Übersicht tab is default", async ({
    page,
  }) => {
    await signIn(page);
    const year = new Date().getFullYear();
    const res = await page.goto(`/app/jahresabschluss/${year}`);
    expect([200, 302, 307]).toContain(res?.status() ?? 200);
    // /app/jahresabschluss/[year] either renders Übersicht or redirects to it
    await page.waitForURL(/uebersicht/, { timeout: 5000 }).catch(() => {});
    await expect(page.locator("h1")).toContainText(`Jahresabschluss ${year}`);
    // C1 cycle-2: the heading on the table is now "Sphären-Übersicht"
    await expect(page.locator("text=Sphären-Übersicht")).toBeVisible();
  });

  test("[year] page shows all four spheres in the YoY table", async ({
    page,
  }) => {
    await signIn(page);
    const year = new Date().getFullYear();
    await page.goto(`/app/jahresabschluss/${year}/uebersicht`);
    await expect(page.locator("text=Ideeller Bereich").first()).toBeVisible();
    await expect(
      page.locator("text=Vermögensverwaltung").first(),
    ).toBeVisible();
    await expect(page.locator("text=Zweckbetrieb").first()).toBeVisible();
    await expect(
      page.locator("text=Wirtschaftlicher Geschäftsbetrieb").first(),
    ).toBeVisible();
  });

  test("[year] header shows Steuerberater-Paket button", async ({ page }) => {
    await signIn(page);
    const year = new Date().getFullYear();
    await page.goto(`/app/jahresabschluss/${year}/uebersicht`);
    await expect(
      page.locator('[data-testid="header-action-bundle"]'),
    ).toBeVisible();
  });

  test("Festschreibung section is present on Übersicht", async ({ page }) => {
    await signIn(page);
    const year = new Date().getFullYear();
    await page.goto(`/app/jahresabschluss/${year}/uebersicht`);
    await expect(
      page.locator("text=Jahresabschluss schließen"),
    ).toBeVisible();
  });

  test("gobd-export page renders for authenticated user", async ({ page }) => {
    await signIn(page);
    const year = new Date().getFullYear();
    const res = await page.goto(`/app/jahresabschluss/${year}/gobd-export`);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toContainText("GoBD-Z3");
    await expect(page.locator("text=IDEA-Import Anleitung")).toBeVisible();
  });

  test("invalid year returns 400", async ({ page }) => {
    await signIn(page);
    const res = await page.goto("/app/jahresabschluss/1800");
    expect(res?.status()).toBe(400);
  });
});
