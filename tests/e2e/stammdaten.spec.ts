/**
 * @phase-9 Stammdaten — Verein settings page (extends settings table).
 *
 * Signs in as the test admin via the magic-link verify flow (same pattern as
 * admin-shell.spec.ts), navigates to /app/einstellungen/verein, fills in the
 * Vereinsname, saves, reloads, and confirms the value persisted (env-fallback
 * hint disappears once the row exists in `settings`).
 */

import { expect, test } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";

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

  // Clean any verein.* rows from prior runs so the env-fallback hint is in a
  // known state when this test starts.
  await client`DELETE FROM settings WHERE key LIKE 'verein.%'`;

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

test.describe("@phase-9 Stammdaten settings", () => {
  test("form pre-populated from env-fallback, save persists to settings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    await page.goto("/app/einstellungen/verein");

    // Heading visible
    await expect(
      page.getByRole("heading", { name: /Stammdaten/i }),
    ).toBeVisible();

    // No row in settings yet → env-fallback hint should be present for name.
    await expect(page.getByTestId("stammdaten-name-source")).toBeVisible();

    const nameInput = page.getByTestId("stammdaten-name");
    await nameInput.fill("Folge der Wolke e.V.");

    await page.getByTestId("stammdaten-submit").click();

    // Saved confirmation appears.
    await expect(page.getByTestId("stammdaten-saved")).toBeVisible({
      timeout: 5_000,
    });

    await page.reload();

    // Value persisted across reload.
    await expect(page.getByTestId("stammdaten-name")).toHaveValue(
      "Folge der Wolke e.V.",
    );

    // Env-fallback hint disappeared (the row now exists in settings).
    await expect(page.getByTestId("stammdaten-name-source")).toHaveCount(0);
  });
});
