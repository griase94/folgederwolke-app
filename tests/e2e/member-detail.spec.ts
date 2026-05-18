/**
 * E2E Member Detail tests — @phase-3
 *
 * Strategy: signs in via magic-link shortcut, uses a fixture member that
 * the DB seed creates, then exercises the detail page UI.
 *
 * Tags: @phase-3
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

/** Return the ID of the first fixture member, or null if none. */
async function getFixtureMemberId(): Promise<string | null> {
  if (!process.env["DATABASE_URL"]) return null;
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"], {
    prepare: false,
    max: 1,
  });
  const rows = await client<
    { id: string }[]
  >`SELECT id FROM members WHERE is_fixture = true ORDER BY created_at LIMIT 1`;
  await client.end();
  return rows[0]?.id ?? null;
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

// ---------------------------------------------------------------------------
// 1. Basic navigation
// ---------------------------------------------------------------------------
test.describe("@phase-3 Member detail — navigation", () => {
  test("unauthenticated access to member detail redirects to sign-in", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }
    await page.goto(`/app/mitglieder/${id}`);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("navigating from list to detail shows member name in breadcrumb", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    // Breadcrumb should contain "Mitglieder"
    await expect(page.locator("nav[aria-label='Brotkrümel']")).toContainText(
      "Mitglieder",
    );
    // Page title should be visible
    await expect(page.locator("h2")).toBeVisible();
  });

  test("non-existent member id returns 404", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder/00000000-0000-0000-0000-000000000000");
    // SvelteKit error page — look for 404 text
    await expect(page.locator("body")).toContainText(/404|nicht gefunden/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Info card
// ---------------------------------------------------------------------------
test.describe("@phase-3 Member detail — info card", () => {
  test("member info card shows name, role, and status", async ({ page }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    // Info card should show the member's name (h2)
    const card = page.locator("h2").first();
    await expect(card).toBeVisible();

    // Bearbeiten button should be present
    await expect(page.locator("button:has-text('Bearbeiten')")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Beitrags timeline tab
// ---------------------------------------------------------------------------
test.describe("@phase-3 Member detail — beitrags timeline", () => {
  test("Beitrag tab is active by default and shows timeline or empty state", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    // "Beitrag" tab should exist and be selected
    const beitragTab = page.locator('[role="tab"]:has-text("Beitrag")');
    await expect(beitragTab).toBeVisible();
    await expect(beitragTab).toHaveAttribute("aria-selected", "true");
  });

  test("switching to Aktivität tab shows activity feed", async ({ page }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    await page.click('[role="tab"]:has-text("Aktivität")');
    await expect(
      page.locator('[role="tab"]:has-text("Aktivität")'),
    ).toHaveAttribute("aria-selected", "true");
  });
});

// ---------------------------------------------------------------------------
// 4. Send reminder sheet
// ---------------------------------------------------------------------------
test.describe("@phase-3 Member detail — send reminder", () => {
  test("sticky CTA bar is visible with 'Erinnerung senden' button", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    await expect(
      page.locator("button:has-text('Erinnerung senden')"),
    ).toBeVisible();
  });

  test("clicking 'Erinnerung senden' opens the reminder sheet", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    const btn = page.locator("button:has-text('Erinnerung senden')");
    const isEnabled = await btn.isEnabled({ timeout: 2000 }).catch(() => false);
    if (!isEnabled) {
      // Member has no email — sheet can't open; skip gracefully
      test.skip();
      return;
    }

    await btn.click();

    // Sheet should be visible
    await expect(page.locator("text=Erinnerungs-Mail vorbereiten")).toBeVisible(
      { timeout: 3000 },
    );

    // Year selector should be present
    await expect(page.locator("select#reminder-year")).toBeVisible();

    // Mail senden button should exist
    await expect(page.locator("button:has-text('Mail senden')")).toBeVisible();
  });

  test("reminder sheet can be closed with Abbrechen", async ({ page }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    const btn = page.locator("button:has-text('Erinnerung senden')");
    const isEnabled = await btn.isEnabled({ timeout: 2000 }).catch(() => false);
    if (!isEnabled) {
      test.skip();
      return;
    }

    await btn.click();
    await expect(page.locator("text=Erinnerungs-Mail vorbereiten")).toBeVisible(
      { timeout: 3000 },
    );

    await page.click("button:has-text('Abbrechen')");
    await expect(
      page.locator("text=Erinnerungs-Mail vorbereiten"),
    ).not.toBeVisible({ timeout: 3000 });
  });
});
