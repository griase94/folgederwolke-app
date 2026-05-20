/**
 * @phase-7 C7 — Mobile device matrix smoke (iPhone SE)
 *
 * iPhone SE is the narrowest mainstream viewport (375px logical).
 * One pass: /app renders without horizontal overflow and the mobile tab
 * bar is visible.
 */

import { expect, test, devices } from "@playwright/test";
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

test.use({ ...devices["iPhone SE"] });

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-7 C7 mobile-polish (iPhone SE)", () => {
  test("/app renders with no horizontal overflow on iPhone SE", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app");

    const overflows = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(overflows, "iPhone SE should not horizontally overflow").toBe(false);

    await expect(
      page.getByRole("navigation", { name: "Mobile Navigation" }),
    ).toBeVisible();
  });
});
