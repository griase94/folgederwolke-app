/**
 * E2E Kunden tests — @phase-5
 *
 * Strategy: uses a direct DB connection to set up test state, then drives
 * the browser through the CRUD flows. Requires DATABASE_URL + TEST_ADMIN_EMAIL
 * in the environment.
 *
 * Tags: @phase-5
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

// ---------------------------------------------------------------------------
// 1. Navigation
// ---------------------------------------------------------------------------
test.describe("@phase-5 Kunden — navigation", () => {
  test("unauthenticated /app/kunden redirects to sign-in", async ({ page }) => {
    await page.goto("/app/kunden");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("authenticated user sees Kunden page", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/kunden");
    await expect(page.locator("h1")).toContainText("Kunden");
  });
});

// ---------------------------------------------------------------------------
// 2. Add customer
// ---------------------------------------------------------------------------
test.describe("@phase-5 Kunden — add customer", () => {
  test("can add a new customer via dialog", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/kunden");

    await page.click("button:has-text('Kunde hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const unique = randomBytes(4).toString("hex");
    const name = `E2E-Kunde-${unique} GmbH`;
    await page.fill('input[name="name"]', name);
    await page.fill('input[name="email"]', `test-${unique}@example.com`);

    await page.click('button[type="submit"]:has-text("Hinzufügen")');

    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator(`text=E2E-Kunde-${unique} GmbH`)).toBeVisible();
  });

  test("shows validation error for invalid email", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/kunden");

    await page.click("button:has-text('Kunde hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    await page.fill('input[name="name"]', "Test Kunde");
    await page.fill('input[name="email"]', "not-an-email");

    await page.click('button[type="submit"]:has-text("Hinzufügen")');
    // Either HTML5 validation or server error — dialog stays open
    await expect(page.locator('[role="dialog"]')).toBeVisible({
      timeout: 3_000,
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Search
// ---------------------------------------------------------------------------
test.describe("@phase-5 Kunden — search", () => {
  test("search input is visible and interactive", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/kunden");

    const searchInput = page.locator('input[aria-label="Kunden suchen"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill("xyznotfound");
    await expect(
      page.locator('[role="list"], .text-muted-foreground'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Edit customer
// ---------------------------------------------------------------------------
test.describe("@phase-5 Kunden — edit customer", () => {
  test("can open edit dialog from kebab menu", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/kunden");

    // Add a customer first
    await page.click("button:has-text('Kunde hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    const unique = randomBytes(4).toString("hex");
    const name = `E2E-Edit-Kunde-${unique}`;
    await page.fill('input[name="name"]', name);
    await page.click('button[type="submit"]:has-text("Hinzufügen")');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator(`text=${name}`)).toBeVisible();

    // Open kebab
    const row = page.locator(`[role="listitem"]:has-text("${name}")`).first();
    await row.locator('[aria-label^="Aktionen"]').click();
    await expect(page.locator('[role="menu"]')).toBeVisible();
    await page.locator('[role="menuitem"]:has-text("Bearbeiten")').click();

    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator(`input[name="name"]`)).toHaveValue(name);
  });
});

// ---------------------------------------------------------------------------
// 5. /api/customers autocomplete
// ---------------------------------------------------------------------------
test.describe("@phase-5 /api/customers", () => {
  test("returns JSON array with results key", async ({ page }) => {
    await signIn(page);

    const response = await page.request.get("/api/customers?q=");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("results");
    expect(Array.isArray(body.results)).toBe(true);
  });

  test("unauthenticated request returns 401", async ({ page }) => {
    const response = await page.request.get("/api/customers?q=test");
    expect(response.status()).toBe(401);
  });
});
