/**
 * E2E tests for the Phase 3 admin shell.
 *
 * @phase-3 — admin-shell: sidebar + topbar + mobile tab bar + sign-out
 *
 * Strategy: authenticate by inserting a magic_link + session row directly
 * into Postgres (same pattern as auth.spec.ts), then verify the shell UI.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Use TEST_ADMIN_EMAIL when set (CI/Neon), otherwise default to the local
// .env.test ADMIN_EMAILS value (admin@example.com). This matches the pattern
// used by all other phase-3+ specs.
const TEST_ADMIN_EMAIL = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

// ---------------------------------------------------------------------------
// Helper: sign in via the magic-link verify flow.
// Direct cookie injection is impossible because session cookies are
// HMAC-signed with SESSION_SECRET (see src/lib/server/auth/cookies.ts);
// going through verify is how all other phase-3+ specs authenticate.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// @phase-3 admin-shell tests
// ---------------------------------------------------------------------------

test.describe("@phase-3 Admin shell — sidebar (desktop)", () => {
  test("authenticated user sees sidebar on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    // Sidebar should be visible at desktop width
    const sidebar = page.getByRole("complementary", {
      name: "Hauptnavigation",
    });
    await expect(sidebar).toBeVisible();

    // Logo / brand name visible (use first() — text appears in sidebar +
    // mobile topbar + main heading; assertion just checks it renders)
    await expect(page.getByText("Folge der Wolke").first()).toBeVisible();

    // Dashboard nav item highlighted (C9: renamed Heute → Übersicht)
    const dashLink = page.getByRole("link", { name: /Übersicht/ });
    await expect(dashLink).toBeVisible();
  });
});

test.describe("@phase-3 Admin shell — mobile tab bar", () => {
  test("authenticated user sees bottom tab bar on mobile (not sidebar)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    await signIn(page);

    // Mobile nav should be visible
    const mobileNav = page.getByRole("navigation", {
      name: "Mobile Navigation",
    });
    await expect(mobileNav).toBeVisible();

    // Desktop sidebar should NOT be visible on mobile
    const sidebar = page.getByRole("complementary", {
      name: "Hauptnavigation",
    });
    await expect(sidebar).toBeHidden();
  });
});

test.describe("@phase-3 Admin shell — topbar search", () => {
  test("search input is visible and focusable on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    // The element carries role="combobox" with aria-label="Admin-Suche";
    // SvelteKit's role="combobox" override means we can't query as searchbox.
    const searchInput = page.getByRole("combobox", { name: "Admin-Suche" });
    await expect(searchInput).toBeVisible();
    await searchInput.click();
    await expect(searchInput).toBeFocused();
  });

  test("Cmd-K focuses the search input", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    // Press Cmd+K
    await page.keyboard.press("Meta+k");

    const searchInput = page.getByRole("combobox", { name: "Admin-Suche" });
    await expect(searchInput).toBeFocused();
  });
});

test.describe("@phase-3 Admin shell — sign out", () => {
  test("user can sign out via UserMenu", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    // Open user menu
    const userMenuTrigger = page.getByRole("button", {
      name: "Benutzermenü öffnen",
    });
    await expect(userMenuTrigger).toBeVisible();
    await userMenuTrigger.click();

    // Click Abmelden (rendered as a DropdownMenuItem, role=menuitem)
    const abmeldenBtn = page.getByRole("menuitem", { name: "Abmelden" });
    await expect(abmeldenBtn).toBeVisible();
    await abmeldenBtn.click();

    // Should redirect to /sign-in
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("@phase-3 Admin shell — dashboard", () => {
  test("dashboard shows KPI cards and checklist", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);

    // Kennzahlen region renders
    await expect(
      page.getByRole("region", { name: "Kennzahlen" }),
    ).toBeVisible();
    // Specific KPI labels — those still present after Phase 6/7 changes
    await expect(page.getByText("Offene Auslagen").first()).toBeVisible();
  });

  // Regression guard — the magic-link-flow rewrite quietly dropped these
  // assertions. Labels match the current $derived list in
  // src/lib/components/admin/dashboard/KpiSection.svelte. Update both places
  // together if a KPI is ever renamed.
  test("dashboard renders all four KPI labels for admin", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page);
    await expect(page.getByText("Offene Auslagen").first()).toBeVisible();
    await expect(page.getByText("Zu erstatten").first()).toBeVisible();
    await expect(page.getByText("Beitrag fällig").first()).toBeVisible();
    await expect(page.getByText("Spenden YTD").first()).toBeVisible();
  });
});

test.describe("@phase-3 Search API stub", () => {
  test("GET /api/search returns empty grouped results", async ({
    page,
    request,
  }) => {
    // /api/search requires an authenticated session — sign in first so the
    // cookie jar carries a valid session for the apiRequest call below.
    await signIn(page);

    const resp = await request.get("/api/search?q=test");
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("query", "test");
    expect(body.results).toHaveProperty("members");
    expect(body.results).toHaveProperty("expenses");
    expect(Array.isArray(body.results.members)).toBe(true);
  });
});
