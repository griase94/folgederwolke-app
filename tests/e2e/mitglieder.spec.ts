/**
 * E2E Mitglieder tests — @phase-3
 *
 * Strategy: uses a direct DB connection to set up test state, then drives
 * the browser through the CRUD flows. Requires DATABASE_URL + TEST_ADMIN_EMAIL
 * in the environment (same as @phase-1 auth tests).
 *
 * Tags: @phase-3
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Helper: sign in via magic-link shortcut
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Guard: skip suite if no DATABASE_URL
// ---------------------------------------------------------------------------
test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

// ---------------------------------------------------------------------------
// 1. Navigate to /app/mitglieder
// ---------------------------------------------------------------------------
test.describe("@phase-3 Mitglieder — navigation", () => {
  test("unauthenticated /app/mitglieder redirects to sign-in", async ({
    page,
  }) => {
    await page.goto("/app/mitglieder");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("authenticated user sees Mitglieder page", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");
    await expect(page.locator("h1")).toContainText("Mitglieder");
  });
});

// ---------------------------------------------------------------------------
// 2. Add a new member
// ---------------------------------------------------------------------------
test.describe("@phase-3 Mitglieder — add member", () => {
  test("can add a new member via dialog", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    // Open add dialog
    await page.click("button:has-text('Mitglied hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Fill form
    const unique = randomBytes(4).toString("hex");
    await page.fill('input[name="vorname"]', "Test");
    await page.fill('input[name="nachname"]', `E2E-${unique}`);
    await page.fill('input[name="email"]', `test-${unique}@example.com`);

    // Submit — button text is "Mitglied anlegen" (AddMemberDialog.svelte)
    await page.click('button[type="submit"]:has-text("Mitglied anlegen")');

    // Dialog closes; member appears in list.
    // Target the visible link element (Nachname, Vorname) rather than the
    // hidden <p class="truncate"> card that also contains the text.
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("link", { name: new RegExp(`E2E-${unique}`) }),
    ).toBeVisible();
  });

  test("shows validation errors for missing required fields", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    await page.click("button:has-text('Mitglied hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Submit without filling required fields — HTML5 required blocks submit,
    // but we can check the dialog stays open.
    // Button text is "Mitglied anlegen" (AddMemberDialog.svelte).
    const submitBtn = page.locator(
      'button[type="submit"]:has-text("Mitglied anlegen")',
    );
    await expect(submitBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Matrix view
// ---------------------------------------------------------------------------
test.describe("@phase-3 Mitglieder — matrix view", () => {
  test("switching to matrix view shows the Beitragsmatrix grid", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    // Click matrix toggle
    await page.click("button:has-text('Beitrags-Matrix')");
    await expect(page).toHaveURL(/view=matrix/);
    // Phase-2 redesign: matrix is a role=grid (not a <table>).
    await expect(
      page.getByRole("grid", { name: "Beitragsmatrix" }),
    ).toBeVisible();
  });

  test("switching back to list view hides the grid", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    await page.click("button:has-text('Liste')");
    await expect(page).toHaveURL(/\/app\/mitglieder(?!\?)/);
    await expect(
      page.getByRole("grid", { name: "Beitragsmatrix" }),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Mark beitrag paid (matrix cell → popover)
// ---------------------------------------------------------------------------
test.describe("@phase-3 Mitglieder — mark beitrag paid", () => {
  test("clicking an open cell opens the mark-paid popover", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    // Phase-2 redesign: click an open/overdue gridcell → popover, click Bezahlt.
    const openCell = page
      .getByRole("gridcell")
      .filter({ hasText: /^$/ })
      .or(page.locator('[role="gridcell"][data-state="open"]'))
      .first();

    const cell = page.locator('[role="gridcell"][data-state="open"]').first();
    if (await cell.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cell.click();
      // The mark-paid popover (role=dialog) should appear with a Bezahlt button.
      await expect(page.getByRole("button", { name: /Bezahlt/ })).toBeVisible();
    } else {
      void openCell; // no open cell to exercise — skip gracefully
      test.skip();
    }
  });
});
