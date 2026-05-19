/**
 * E2E DSGVO tests — @phase-7
 *
 * Covers:
 *  1. Unauthenticated access redirects to sign-in
 *  2. Authenticated admin can access /app/dsgvo
 *  3. Searching for a known email shows the Auskunft preview
 *
 * Strategy: uses a direct DB connection to set up a magic-link session,
 * then drives the browser. Requires DATABASE_URL + TEST_ADMIN_EMAIL env vars.
 *
 * Tags: @phase-7
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

// ── Guard ─────────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

// ── 1. Unauthenticated redirect ───────────────────────────────────────────────

test.describe("@phase-7 DSGVO — access control", () => {
  test("unauthenticated /app/dsgvo redirects to sign-in", async ({ page }) => {
    await page.goto("/app/dsgvo");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

// ── 2. Page loads for authenticated admin ─────────────────────────────────────

test.describe("@phase-7 DSGVO — page load", () => {
  test("authenticated admin sees DSGVO panel", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/dsgvo");
    await expect(page.locator("h1")).toContainText("DSGVO");
    await expect(
      page.locator('[data-testid="dsgvo-email-input"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="auskunft-btn"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="pseudonymise-btn"]'),
    ).toBeVisible();
  });

  test("CTA buttons are disabled when email field is empty", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/dsgvo");

    const auskunftBtn = page.locator('[data-testid="auskunft-btn"]');
    const pseudoBtn = page.locator('[data-testid="pseudonymise-btn"]');
    await expect(auskunftBtn).toBeDisabled();
    await expect(pseudoBtn).toBeDisabled();
  });
});

// ── 3. Auskunft search for known email shows preview ─────────────────────────

test.describe("@phase-7 DSGVO — Auskunft flow", () => {
  test("submitting Auskunft for admin email shows preview pane", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/dsgvo");

    const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
    await page.fill('[data-testid="dsgvo-email-input"]', adminEmail);

    // Click Auskunft generieren
    await page.click('[data-testid="auskunft-btn"]');

    // Preview pane should appear
    await expect(page.locator('[data-testid="auskunft-result"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator('[data-testid="auskunft-preview"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="auskunft-email"]')).toContainText(
      adminEmail,
    );
  });

  test("Auskunft preview shows a download button when PDF is available", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/dsgvo");

    const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
    await page.fill('[data-testid="dsgvo-email-input"]', adminEmail);
    await page.click('[data-testid="auskunft-btn"]');

    await expect(page.locator('[data-testid="auskunft-result"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.locator('[data-testid="download-pdf-btn"]'),
    ).toBeVisible();
  });
});

// ── 4. Pseudonymise confirm modal ─────────────────────────────────────────────

test.describe("@phase-7 DSGVO — Pseudonymise modal", () => {
  test("clicking Pseudonymisieren opens confirm modal", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/dsgvo");

    await page.fill('[data-testid="dsgvo-email-input"]', "test@example.com");
    await page.click('[data-testid="pseudonymise-btn"]');

    await expect(
      page.locator('[data-testid="pseudonymise-modal"]'),
    ).toBeVisible();
  });

  test("submit button is disabled until email matches", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/dsgvo");

    await page.fill('[data-testid="dsgvo-email-input"]', "test@example.com");
    await page.click('[data-testid="pseudonymise-btn"]');

    const submitBtn = page.locator('[data-testid="pseudonymise-submit-btn"]');
    await expect(submitBtn).toBeDisabled();

    // Type partial email — still disabled
    await page.fill('[data-testid="confirm-email-input"]', "test@");
    await expect(submitBtn).toBeDisabled();

    // Type full matching email — now enabled
    await page.fill('[data-testid="confirm-email-input"]', "test@example.com");
    await expect(submitBtn).not.toBeDisabled();
  });
});
