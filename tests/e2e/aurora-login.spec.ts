import { test, expect } from "@playwright/test";

// @phase-aurora-slice3 — Aurora slice 3: login & public flow.
// Spec: docs/superpowers/specs/2026-06-11-aurora-ui-redesign-design.md §6.

test.describe("@phase-aurora-slice3 Aurora login — desktop split hero", () => {
  test("gradient panel, Vereins-Login heading, subline, gradient submit", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByTestId("login-hero-panel")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Vereins-Login" }),
    ).toBeVisible();
    await expect(
      page.getByText("Anmelde-Link per E-Mail — kein Passwort nötig."),
    ).toBeVisible();
    await expect(page.getByTestId("login-submit")).toBeVisible();
    // The compact gradient band is mobile-only.
    await expect(page.getByTestId("login-mobile-band")).toBeHidden();
  });

  test("email input carries the public-form input-quality attributes", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    const email = page.locator('input[name="email"]');
    await expect(email).toHaveAttribute("autocomplete", "email");
    await expect(email).toHaveAttribute("inputmode", "email");
    await expect(email).toHaveAttribute("autocapitalize", "none");
    await expect(email).toHaveAttribute("enterkeyhint", "send");
    await expect(email).not.toHaveAttribute("autofocus");
  });

  test("ambient orbs run a ≥20s transform-only loop", async ({ page }) => {
    await page.goto("/sign-in");
    const orb = page.locator(".orb").first();
    const name = await orb.evaluate((el) => getComputedStyle(el).animationName);
    expect(name).not.toBe("none");
    const duration = await orb.evaluate(
      (el) => getComputedStyle(el).animationDuration,
    );
    expect(parseFloat(duration)).toBeGreaterThanOrEqual(20);
  });

  test("orbs are static under prefers-reduced-motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/sign-in");
    const name = await page
      .locator(".orb")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe("none");
  });
});

test.describe("@phase-aurora-slice3 Aurora login — Link gesendet state", () => {
  test("submit swaps to the panel: exact email, focused heading, cooldown, anti-enumeration copy", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.fill('input[name="email"]', "julia@example.com");
    await page.getByTestId("login-submit").click();

    const panel = page.getByTestId("link-sent-panel");
    await expect(panel).toBeVisible();
    // Exact email shown (the user's own input — no enumeration leak).
    await expect(page.getByTestId("link-sent-email")).toHaveText(
      "julia@example.com",
    );
    // Anti-enumeration copy preserved (auth.spec.ts @phase-1 contract).
    await expect(panel).toContainText("Schau in dein Postfach");
    // Focus contract: focus moves to the new heading.
    await expect(
      page.getByRole("heading", { name: "Link gesendet" }),
    ).toBeFocused();
    // Resend is disabled with a visible countdown.
    const resend = page.getByTestId("resend-button");
    await expect(resend).toBeDisabled();
    await expect(resend).toContainText("Erneut senden (");
  });

  test("Falsche Adresse? returns to the form with the email preserved and focused", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.fill('input[name="email"]', "julia@example.com");
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("link-sent-panel")).toBeVisible();

    await page.getByTestId("wrong-address-button").click();
    const email = page.locator('input[name="email"]');
    await expect(email).toBeVisible();
    await expect(email).toHaveValue("julia@example.com");
    await expect(email).toBeFocused();
  });
});
