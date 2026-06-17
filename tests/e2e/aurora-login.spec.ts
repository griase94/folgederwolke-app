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
