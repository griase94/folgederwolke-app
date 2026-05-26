import { expect, test } from "@playwright/test";

/**
 * @phase-2 — PWA navigation / no-dead-end + login reachability (A1).
 *
 * Pins the fixes for the "logged out → always the Auslage form, no way to log
 * in / trapped in the standalone PWA" bug:
 *   - logged-out `/` renders a real landing with both CTAs (not a silent
 *     redirect into the form);
 *   - every public page carries a way to login via the shared (public) shell;
 *   - the sign-in page carries the reverse way back to the form;
 *   - the success + error pages are not dead-ends;
 *   - the sticky "Auslage tab" preference fast-forwards a returning external to
 *     the form, but a device that has ever authenticated is NEVER auto-trapped
 *     on the form (the logged-out-admin safety rule).
 *
 * All tests run logged out (no auth fixture). Requires PUBLIC_FORM_ENABLED=true
 * (set in .env.test).
 */

test.describe("@phase-2 PWA navigation — login reachability", () => {
  test("logged-out / renders the landing with working Anmelden + Auslage CTAs", async ({
    page,
  }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    // Real hrefs (the bug was buttons with no href).
    await expect(page.locator('a[href="/sign-in"]')).toBeVisible();
    await expect(page.locator('a[href="/auslage-einreichen"]')).toBeVisible();
  });

  test("the public Auslage form exposes a Vereins-Login escape (shell)", async ({
    page,
  }) => {
    await page.goto("/auslage-einreichen");
    const login = page.locator('header a[href="/sign-in"]');
    await expect(login).toBeVisible();
    await expect(login).toContainText("Vereins-Login");
  });

  test("the sign-in page carries the reverse link back to the form", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(
      page.locator('header a[href="/auslage-einreichen"]'),
    ).toBeVisible();
  });

  test("the success page is not a dead-end (Neue Auslage link, even without id)", async ({
    page,
  }) => {
    await page.goto("/auslage-eingereicht");
    await expect(page.locator('a[href="/auslage-einreichen"]')).toBeVisible();
  });

  test("the error page offers explicit nav (no history.back dead-end)", async ({
    page,
  }) => {
    // Malformed AUS-ID → 404 error page.
    await page.goto("/auslage-status/not-a-valid-id");
    await expect(page.locator('a[href="/"]')).toBeVisible();
    await expect(page.locator('a[href="/sign-in"]')).toBeVisible();
    // The old no-op "Zurück" (history.back) button must be gone.
    await expect(page.getByRole("button", { name: "Zurück" })).toHaveCount(0);
  });

  test("sticky: a returning external (submitted before, never authed) is sent to the form", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() =>
      localStorage.setItem("fdw:preferredEntry", "auslage"),
    );
    await page.goto("/");
    await page.waitForURL(/\/auslage-einreichen/);
    expect(new URL(page.url()).pathname).toBe("/auslage-einreichen");
  });

  test("safety: a device that ever authenticated is NOT auto-trapped on the form", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("fdw:hasAuthedBefore", "1");
      localStorage.setItem("fdw:preferredEntry", "auslage");
    });
    await page.goto("/");
    // Stays on the landing (with Anmelden), never redirected to the form.
    await expect(page.locator('a[href="/sign-in"]')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });
});
