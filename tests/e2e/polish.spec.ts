/**
 * E2E polish tests — @phase-7
 *
 * Covers:
 *  1. Root 404 — friendly +error.svelte with "Zurück zur Startseite" CTA
 *  2. Admin 404 — /app/+error.svelte (unauthenticated: redirects to sign-in)
 *  3. sign-out?/everywhere action — rejects unauthenticated callers gracefully
 */

import { expect, test } from "@playwright/test";

// ---------------------------------------------------------------------------
// 1. Root-level 404 renders friendly error page (German, rosa, CTA present)
// ---------------------------------------------------------------------------

test.describe("@phase-7 polish — 404 pages", () => {
  test("unknown root route renders friendly 404 page", async ({ page }) => {
    const res = await page.goto("/this-page-does-not-exist-phase7");
    expect(res?.status()).toBe(404);

    // German heading
    await expect(
      page.getByRole("heading", { name: /Seite nicht gefunden/i }),
    ).toBeVisible();

    // CTA back to home
    const cta = page.getByRole("link", { name: /Zurück zur Startseite/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/");
  });

  test("404 page shows status code 404", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-phase7");
    // The large rosa status number is aria-hidden but present in DOM
    const statusEl = page.locator("p", { hasText: "404" }).first();
    await expect(statusEl).toBeVisible();
  });

  test("back button is rendered on 404", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-phase7");
    await expect(page.getByRole("button", { name: /Zurück/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. sign-out?/everywhere — unauthenticated POST redirects to /sign-in
//    (no session means locals.session is undefined → redirect 303 → /sign-in)
// ---------------------------------------------------------------------------

test.describe("@phase-7 polish — sign-out-everywhere action", () => {
  test("unauthenticated ?/everywhere POST redirects to sign-in", async ({
    page,
  }) => {
    // Send a form POST without a session cookie
    const response = await page.request.post("/sign-out?/everywhere", {
      form: {},
    });
    // SvelteKit follows 303 redirects — end URL should be /sign-in
    expect(response.url()).toMatch(/\/sign-in/);
  });
});
