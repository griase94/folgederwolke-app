/**
 * E2E Audit Inbox tests — @phase-4.
 *
 * Strategy: bypass magic-link issuance by inserting a magic_links row
 * directly into Postgres (mirrors mitglieder.spec.ts), seed a single
 * auslagen_submission row with a unique business_id, then drive the browser
 * through:
 *   1. /app/inbox       — list shows the new submission
 *   2. /app/inbox/AUS-… — full-screen review card renders
 *   3. The Aufwandsspende stub modal opens with the Phase-2-deferred notice
 *
 * Requires DATABASE_URL + TEST_ADMIN_EMAIL in the environment.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

interface SeedRow {
  businessId: string;
  bezeichnung: string;
  submissionId: string;
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
// Helper: insert a pending auslagen_submission row
// ---------------------------------------------------------------------------
async function seedSubmission(): Promise<SeedRow> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  // Use a high counter (900-series) to avoid colliding with id_counters.
  const unique = randomBytes(2).toString("hex").toUpperCase();
  const businessId = `AUS-2026-E2E${unique}`;
  const bezeichnung = `E2E Test Auslage ${unique}`;

  const rows = await client<{ id: string }[]>`
    INSERT INTO auslagen_submissions (
      business_id,
      bezeichnung,
      betrag_cents,
      bezahlt_von_kind,
      bezahlt_von_display,
      consent_text_version
    ) VALUES (
      ${businessId},
      ${bezeichnung},
      ${4250},
      ${"verein"},
      ${"Verein"},
      ${"v1"}
    )
    RETURNING id
  `;
  await client.end();
  return {
    businessId,
    bezeichnung,
    submissionId: rows[0]?.id ?? "",
  };
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
// 1. Inbox is route-protected
// ---------------------------------------------------------------------------
test.describe("@phase-4 Audit Inbox — navigation", () => {
  test("unauthenticated /app/inbox redirects to sign-in", async ({ page }) => {
    await page.goto("/app/inbox");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("authenticated user sees Audit Inbox heading", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/inbox");
    await expect(page.locator("h1")).toContainText("Audit Inbox");
  });
});

// ---------------------------------------------------------------------------
// 2. List view shows pending submission; detail view renders the review card
// ---------------------------------------------------------------------------
test.describe("@phase-4 Audit Inbox — list + detail", () => {
  test("seeded submission appears in list and opens detail card", async ({
    page,
  }) => {
    const seed = await seedSubmission();

    await signIn(page);
    await page.goto("/app/inbox");

    // The card with this AUS-ID should appear in the list.
    const card = page
      .locator(`a[href="/app/inbox/${seed.businessId}"]`)
      .first();
    await expect(card).toBeVisible({ timeout: 5_000 });
    await expect(card).toContainText(seed.businessId);
    await expect(card).toContainText(seed.bezeichnung);

    // Click → detail page renders the full-screen review card.
    await card.click();
    await expect(page).toHaveURL(
      new RegExp(`/app/inbox/${seed.businessId.replace(/-/g, "\\-")}$`),
      { timeout: 5_000 },
    );

    // Heading + amount visible.
    await expect(page.locator("article")).toContainText(seed.bezeichnung);
    await expect(page.locator("article")).toContainText("42,50");

    // Action buttons present.
    await expect(page.locator('button:has-text("Freigeben")')).toBeVisible();
    await expect(page.locator('button:has-text("Ablehnen")')).toBeVisible();
    await expect(
      page.locator('button:has-text("Verzicht spenden")'),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Aufwandsspende stub modal opens with the deferred notice
// ---------------------------------------------------------------------------
test.describe("@phase-4 Audit Inbox — Aufwandsspende stub", () => {
  test("clicking Verzicht spenden opens the deferred-notice modal", async ({
    page,
  }) => {
    const seed = await seedSubmission();

    await signIn(page);
    await page.goto(`/app/inbox/${seed.businessId}`);

    await page.click('button:has-text("Verzicht spenden")');
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "Aufwandsspende-Workflow ab Phase 2 verfügbar",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Reject dialog opens with template picker
// ---------------------------------------------------------------------------
test.describe("@phase-4 Audit Inbox — reject dialog", () => {
  test("clicking Ablehnen opens reject dialog with template options", async ({
    page,
  }) => {
    const seed = await seedSubmission();

    await signIn(page);
    await page.goto(`/app/inbox/${seed.businessId}`);

    await page.click('button:has-text("Ablehnen")');

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("ablehnen");
    // Template radios are visible.
    await expect(dialog.locator('input[name="template_key"]')).toHaveCount(5);
  });
});
