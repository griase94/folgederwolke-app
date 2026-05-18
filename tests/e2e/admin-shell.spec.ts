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

// ---------------------------------------------------------------------------
// Helper: create an authenticated session directly in Postgres
// ---------------------------------------------------------------------------
async function createSession(email: string): Promise<string> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  try {
    // Upsert user
    const [user] = await client`
      INSERT INTO users (email_canonical, email, role)
      VALUES (${email}, ${email}, 'admin')
      ON CONFLICT (email_canonical) DO UPDATE SET email = EXCLUDED.email
      RETURNING id
    `;

    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(sessionToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);

    await client`
      INSERT INTO sessions (token_hash, user_id, expires_at, last_used_at)
      VALUES (${tokenHash}, ${user!.id}, ${expiresAt}, now())
      ON CONFLICT DO NOTHING
    `;

    return sessionToken;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// @phase-3 admin-shell tests
// ---------------------------------------------------------------------------

test.describe("@phase-3 Admin shell — sidebar (desktop)", () => {
  test("authenticated user sees sidebar on desktop", async ({
    page,
    context,
  }) => {
    const token = await createSession("andy.griesbeck@gmail.com");

    await context.addCookies([
      {
        name: "session",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");

    // Sidebar should be visible at desktop width
    const sidebar = page.getByRole("complementary", {
      name: "Hauptnavigation",
    });
    await expect(sidebar).toBeVisible();

    // Logo / brand name visible
    await expect(page.getByText("Folge der Wolke")).toBeVisible();

    // Dashboard nav item highlighted
    const dashLink = page.getByRole("link", { name: /Heute/ });
    await expect(dashLink).toBeVisible();
  });
});

test.describe("@phase-3 Admin shell — mobile tab bar", () => {
  test("authenticated user sees bottom tab bar on mobile (not sidebar)", async ({
    page,
    context,
  }) => {
    const token = await createSession("andy.griesbeck@gmail.com");

    await context.addCookies([
      {
        name: "session",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    await page.goto("/app");

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
  test("search input is visible and focusable on desktop", async ({
    page,
    context,
  }) => {
    const token = await createSession("andy.griesbeck@gmail.com");

    await context.addCookies([
      {
        name: "session",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");

    const searchInput = page.getByRole("searchbox", { name: "Admin-Suche" });
    await expect(searchInput).toBeVisible();
    await searchInput.click();
    await expect(searchInput).toBeFocused();
  });

  test("Cmd-K focuses the search input", async ({ page, context }) => {
    const token = await createSession("andy.griesbeck@gmail.com");

    await context.addCookies([
      {
        name: "session",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");

    // Press Cmd+K
    await page.keyboard.press("Meta+k");

    const searchInput = page.getByRole("searchbox", { name: "Admin-Suche" });
    await expect(searchInput).toBeFocused();
  });
});

test.describe("@phase-3 Admin shell — sign out", () => {
  test("user can sign out via UserMenu", async ({ page, context }) => {
    const token = await createSession("andy.griesbeck@gmail.com");

    await context.addCookies([
      {
        name: "session",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");

    // Open user menu
    const userMenuTrigger = page.getByRole("button", {
      name: "Benutzermenü öffnen",
    });
    await expect(userMenuTrigger).toBeVisible();
    await userMenuTrigger.click();

    // Click Abmelden
    const abmeldenBtn = page.getByRole("button", { name: "Abmelden" });
    await expect(abmeldenBtn).toBeVisible();
    await abmeldenBtn.click();

    // Should redirect to /sign-in
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("@phase-3 Admin shell — dashboard", () => {
  test("dashboard shows KPI cards and checklist", async ({ page, context }) => {
    const token = await createSession("andy.griesbeck@gmail.com");

    await context.addCookies([
      {
        name: "session",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/app");

    // KPI cards
    await expect(page.getByText("Offene Auslagen")).toBeVisible();
    await expect(page.getByText("Zu erstatten heute")).toBeVisible();
    await expect(page.getByText("Mitgliederbeitrag fällig")).toBeVisible();
    await expect(page.getByText("Spenden YTD")).toBeVisible();

    // Checklist prompt
    await expect(page.getByText("Was möchtest du heute tun?")).toBeVisible();

    // Checklist items
    await expect(page.getByText("Auslagen warten auf Prüfung")).toBeVisible();
    await expect(page.getByText("Audit Inbox öffnen →")).toBeVisible();
  });
});

test.describe("@phase-3 Search API stub", () => {
  test("GET /api/search returns empty grouped results", async ({ request }) => {
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
