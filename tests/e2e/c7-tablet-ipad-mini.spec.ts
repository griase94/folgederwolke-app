/**
 * @phase-7 C7 — Tablet device matrix smoke (iPad Mini)
 *
 * iPad Mini is the smallest "tablet+" viewport — sidebar should render
 * instead of the mobile tab bar.
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

test.use({ ...devices["iPad Mini"] });

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-7 C7 mobile-polish (iPad Mini)", () => {
  test("/app renders with no horizontal overflow on iPad Mini", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app");

    const overflows = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 1;
    });
    expect(overflows, "iPad Mini should not horizontally overflow").toBe(false);

    // Tablet+: sidebar visible (mobile nav is hidden ≥ md)
    await expect(
      page.getByRole("complementary", { name: "Hauptnavigation" }),
    ).toBeVisible();
  });
});
