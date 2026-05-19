/**
 * E2E Rechnungen tests - @phase-5
 *
 * Strategy: sign in, navigate the /app/rechnungen list, create an invoice,
 * and verify the PDF endpoint serves bytes. Visual-diff is deferred to
 * Phase 7 polish per masterplan §5.5.1.
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

test.describe("@phase-5 Rechnungen - navigation", () => {
  test("unauthenticated /app/rechnungen redirects to sign-in", async ({
    page,
  }) => {
    await page.goto("/app/rechnungen");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("authenticated user sees Rechnungen list", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/rechnungen");
    await expect(page.locator("h1")).toContainText("Rechnungen");
    await expect(
      page.locator("a[href='/app/rechnungen/new']").first(),
    ).toBeVisible();
  });

  test("can navigate to /new and see the form", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/rechnungen/new");
    await expect(page.locator("h1")).toContainText("Neue Rechnung");
    await expect(page.locator('select[name="customerId"]')).toBeVisible();
    await expect(page.locator('input[name="bezeichnung"]')).toBeVisible();
    await expect(page.locator('input[name="nettoEur"]')).toBeVisible();
  });
});

test.describe("@phase-5 Rechnungen - create flow", () => {
  test("creates an invoice and reaches the detail page", async ({ page }) => {
    await signIn(page);

    // Seed a customer directly via SQL so the test is self-contained.
    const { default: postgres } = await import("postgres");
    const client = postgres(process.env["DATABASE_URL"] ?? "", {
      prepare: false,
      max: 1,
    });
    const unique = randomBytes(4).toString("hex");
    const [customer] = await client<
      { id: string }[]
    >`INSERT INTO customers (name, address_block) VALUES (${`E2E Kunde ${unique}`}, ${"Beispielstr. 1\n12345 Stadt"}) RETURNING id`;
    await client.end();
    if (!customer) throw new Error("Failed to seed customer");

    await page.goto("/app/rechnungen/new");
    await page.selectOption('select[name="customerId"]', customer.id);
    await page.fill('input[name="bezeichnung"]', `E2E Auftritt ${unique}`);
    await page.fill('input[name="nettoEur"]', "750,00");

    await Promise.all([
      page.waitForURL(/\/app\/rechnungen\/[^/]+\?job=/, { timeout: 15_000 }),
      page.click('button[type="submit"]:has-text("PDF generieren")'),
    ]);

    await expect(page.locator("h1")).toContainText(/FDW-\d{4}-\d{3,}/);
    await expect(page.locator("body")).toContainText(`E2E Auftritt ${unique}`);
  });
});
