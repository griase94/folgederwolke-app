/**
 * E2E auth tests — @phase-1
 *
 * Strategy: bypass issueMagicLink entirely by inserting magic_link rows
 * directly via getClient() (no real SMTP needed). Test only the verify path
 * and the UI/redirect behaviour.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Helper: insert a magic_link row directly into Postgres
// ---------------------------------------------------------------------------
async function insertMagicLink(
  email: string,
): Promise<{ rawToken: string; tokenHash: string }> {
  // Dynamic import so the module resolves at runtime (server env only)
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

  return { rawToken, tokenHash };
}

// ---------------------------------------------------------------------------
// 1. /app redirects to /sign-in when unauthenticated
// ---------------------------------------------------------------------------

test.describe("@phase-1 Auth — route protection", () => {
  test("/app redirects to /sign-in when unauthenticated", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

// ---------------------------------------------------------------------------
// 2. /sign-in renders the form
// ---------------------------------------------------------------------------

test.describe("@phase-1 Auth — sign-in page", () => {
  test("/sign-in renders with email input and submit button", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Anti-enumeration: both admin and non-admin get the same response
// ---------------------------------------------------------------------------

test.describe("@phase-1 Auth — anti-enumeration", () => {
  test("POST /sign-in returns same message for admin and non-admin", async ({
    page,
  }) => {
    // Non-admin email
    await page.goto("/sign-in");
    await page.fill('input[name="email"]', "notanadmin@randomdomain.example");
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="status"]')).toContainText(
      "Schau in dein Postfach",
    );

    // Admin email — needs ADMIN_EMAILS set in test env; if not, still returns same message
    await page.goto("/sign-in");
    await page.fill('input[name="email"]', "admin@example.com");
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="status"]')).toContainText(
      "Schau in dein Postfach",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. /sign-in/verify click-through: valid token renders page; POST creates session
// ---------------------------------------------------------------------------

test.describe("@phase-1 Auth — verify flow", () => {
  test("valid token renders click-through page; POST creates session and redirects to /app", async ({
    page,
    context,
  }) => {
    // Skip if DATABASE_URL not set in test env (CI without DB)
    if (!process.env["DATABASE_URL"]) {
      test.skip();
      return;
    }

    const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
    const { rawToken } = await insertMagicLink(adminEmail);

    // GET verify page — should show click-through UI
    await page.goto(`/sign-in/verify?token=${rawToken}`);
    await expect(page.locator("h1")).toContainText("Anmeldung bestätigen");

    // The page may show a device-mismatch warning (no intent cookie set in E2E).
    // Click "trotzdem fortfahren" if present, then submit the form.
    const mismatchBtn = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatchBtn.isVisible()) {
      await mismatchBtn.click();
    }

    // Submit the POST form + wait for the SvelteKit-router navigation that
    // use:enhance triggers on the 303 redirect response.
    await Promise.all([
      page.waitForURL(/\/app/, { timeout: 15_000 }),
      page.click('button[type="submit"]'),
    ]);
    await expect(page).toHaveURL(/\/app/);

    // Session cookie should be present
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "session");
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
  });

  test("expired/consumed token shows error", async ({ page }) => {
    await page.goto("/sign-in/verify?token=thisisaninvalidtoken");
    // SvelteKit error page — check for 400 status or error text
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/TOKEN_MISSING|LINK_INVALID_OR_EXPIRED|400|error/i);
  });

  test("missing token parameter returns error", async ({ page }) => {
    await page.goto("/sign-in/verify");
    const body = await page.locator("body").textContent();
    expect(body).toMatch(/TOKEN_MISSING|400|error/i);
  });
});
