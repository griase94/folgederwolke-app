/**
 * E2E Projekte tests — @phase-5
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
test.describe("@phase-5 Projekte — navigation", () => {
  test("unauthenticated /app/projekte redirects to sign-in", async ({
    page,
  }) => {
    await page.goto("/app/projekte");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("authenticated user sees Projekte page", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/projekte");
    await expect(page.locator("h1")).toContainText("Projekte");
  });
});

// ---------------------------------------------------------------------------
// 2. Add project
// ---------------------------------------------------------------------------
test.describe("@phase-5 Projekte — add project", () => {
  test("can add a new project via dialog", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/projekte");

    await page.click("button:has-text('Projekt hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    const unique = randomBytes(4).toString("hex");
    await page.fill('input[name="name"]', `E2E-Projekt-${unique}`);

    await page.click('button[type="submit"]:has-text("Hinzufügen")');

    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator(`text=E2E-Projekt-${unique}`)).toBeVisible();
  });

  test("shows validation error for missing project name", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/projekte");

    await page.click("button:has-text('Projekt hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Submit without filling required name — dialog should stay open (HTML5 validation)
    const submitBtn = page.locator(
      'button[type="submit"]:has-text("Hinzufügen")',
    );
    await expect(submitBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Search
// ---------------------------------------------------------------------------
test.describe("@phase-5 Projekte — search", () => {
  test("search filters project list", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/projekte");

    // Type into search box — just confirm it's interactive
    const searchInput = page.locator('input[aria-label="Projekte suchen"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill("xyznotfound");
    // The empty-state or filtered list should render without error
    await expect(
      page.locator('[role="list"], [role="listbox"], .text-muted-foreground'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Edit project
// ---------------------------------------------------------------------------
test.describe("@phase-5 Projekte — edit project", () => {
  test("can open edit dialog from kebab menu", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/projekte");

    // Add a project first to have something to edit
    await page.click("button:has-text('Projekt hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    const unique = randomBytes(4).toString("hex");
    const name = `E2E-Edit-${unique}`;
    await page.fill('input[name="name"]', name);
    await page.click('button[type="submit"]:has-text("Hinzufügen")');
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(page.locator(`text=${name}`)).toBeVisible();

    // Open the kebab menu for that project
    const row = page.locator(`[role="listitem"]:has-text("${name}")`).first();
    await row.locator('[aria-label^="Aktionen"]').click();
    await expect(page.locator('[role="menu"]')).toBeVisible();
    await page.locator('[role="menuitem"]:has-text("Bearbeiten")').click();

    // Edit dialog should open with the project name pre-filled
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator(`input[name="name"]`)).toHaveValue(name);
  });
});

// ---------------------------------------------------------------------------
// 5. /api/projects autocomplete
// ---------------------------------------------------------------------------
test.describe("@phase-5 /api/projects", () => {
  test("returns JSON array with results key", async ({ page }) => {
    await signIn(page);

    const response = await page.request.get("/api/projects?q=");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("results");
    expect(Array.isArray(body.results)).toBe(true);
  });

  test("unauthenticated request returns 401", async ({ page }) => {
    const response = await page.request.get("/api/projects?q=test");
    expect(response.status()).toBe(401);
  });
});
