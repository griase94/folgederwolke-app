/**
 * Shared magic-link sign-in helper for Playwright E2E tests.
 *
 * Extracted from the local signIn() in tests/e2e/mitglieder.spec.ts so all
 * specs can reuse it without duplication. Supports multiple roles via the
 * ROLE_EMAILS map (Phase 0 Task 0.0).
 *
 * The magic-link bypass works by directly inserting a token into the
 * magic_links table and then visiting /sign-in/verify?token=<raw>. This
 * avoids SMTP I/O and is safe because the test DB is ephemeral.
 *
 * Requires DATABASE_URL in the environment (set by .env.test / global setup).
 */

import type { Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const ROLE_EMAILS: Record<string, string> = {
  admin:
    process.env["TEST_ADMIN_EMAIL"] ??
    process.env["ADMIN_EMAILS"]?.split(",")[0]?.trim() ??
    "admin@example.com",
  steuerberater: process.env["TEST_STEUERBERATER_EMAIL"] ?? "steuer@test.local",
  member_self_service: process.env["TEST_MEMBER_EMAIL"] ?? "member@test.local",
};

export type TestRole = keyof typeof ROLE_EMAILS;

/**
 * Sign in as the given role by injecting a magic-link directly into the
 * test DB and navigating to the verify URL.
 */
export async function loginAs(
  page: Page,
  role: TestRole = "admin",
): Promise<void> {
  const email = ROLE_EMAILS[role];
  if (!email) throw new Error(`No test email configured for role "${role}"`);

  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  try {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000);

    await client`
      INSERT INTO magic_links (token_hash, email_canonical, expires_at)
      VALUES (${tokenHash}, ${email.toLowerCase().trim()}, ${expiresAt})
    `;

    await page.goto(`/sign-in/verify?token=${rawToken}`);

    // Handle the "continue as" confirmation step if present
    const mismatch = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mismatch.click();
    }

    await Promise.all([
      page.waitForURL(/\/app/, { timeout: 15_000 }),
      page.click('button[type="submit"]').catch(() => {
        /* submit button may not be present if auto-redirect */
      }),
    ]);
  } finally {
    await client.end();
  }
}
