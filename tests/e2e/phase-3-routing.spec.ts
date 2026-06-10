/**
 * @phase-3-routing
 *
 * Task 10 smoke — the three flat list routes.
 *
 *  - GET /app/ausgaben (signed in) → 200, renders the list scaffold.
 *
 * Phase 8 T6: /app/transactions is retired (404s). The 308-redirect tests
 * have been removed.
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

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-3-routing flat list routes", () => {
  test("GET /app/ausgaben → 200, renders the list scaffold", async ({
    page,
  }) => {
    await signIn(page);
    const response = await page.goto("/app/ausgaben");
    expect(response?.status()).toBe(200);
    // The scaffold KPI strip is the minimal Phase-3 header every tab ships.
    await expect(page.getByTestId("kpi-strip")).toBeVisible();
    // The single primary create CTA (UX-01) — Neue Ausgabe.
    await expect(
      page.locator('[data-slot="new-cta"]', { hasText: "Neue Ausgabe" }),
    ).toBeVisible();
  });

  test("GET /app/einnahmen and /app/spenden → 200", async ({ page }) => {
    await signIn(page);
    const einnahmen = await page.goto("/app/einnahmen");
    expect(einnahmen?.status()).toBe(200);
    await expect(page.getByTestId("kpi-strip")).toBeVisible();

    const spenden = await page.goto("/app/spenden");
    expect(spenden?.status()).toBe(200);
    await expect(page.getByTestId("kpi-strip")).toBeVisible();
  });

  // Phase 8 T6: /app/transactions redirect tests removed.
  // /app/transactions now 404s (pre-launch, no backward-compat requirement).
});
