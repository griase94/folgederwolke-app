import { test, expect } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

// @phase-9 B-2 — FabBottomSheet "Externe Auslage einreichen" form gate.
//
// The 4th action is gated by `$page.data.formEnabled`. Default test env has
// PUBLIC_FORM_ENABLED=true (see .env.test) so the action is visible. The
// "hidden" case requires booting the webServer with PUBLIC_FORM_ENABLED=false
// — opt in via FAB_FORM_DISABLED=1. /app requires auth so we mint a fresh
// magic link directly in the DB (mirrors the pattern in c7-mobile-* specs).

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

test.describe("@phase-9 B-2 FabBottomSheet form gate", () => {
  test("FAB sheet shows Externe Auslage when formEnabled=true (default)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto("/app");
    await page.getByRole("button", { name: /neu erfassen/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /externe auslage/i }),
    ).toBeVisible();
  });

  test("FAB sheet hides Externe Auslage when formEnabled=false", async ({
    page,
  }) => {
    test.skip(
      process.env["FAB_FORM_DISABLED"] !== "1",
      "Set FAB_FORM_DISABLED=1 to exercise the gated scenario",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await page.goto("/app");
    await page.getByRole("button", { name: /neu erfassen/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /externe auslage/i }),
    ).toHaveCount(0);
  });
});
