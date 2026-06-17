import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

/**
 * Aurora slice 1 — theme system (spec §3).
 * Covers: static data-theme fallback, registry-validated cookie injection
 * (hostile cookie → default theme), and the Einstellungen switcher.
 */
test.describe("@phase-aurora-1 Aurora theme system", () => {
  test("public page renders data-theme=aurora with the aurora primary token", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aurora");
    const primary = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
    );
    expect(primary).toBe("#ff1e8c");
  });

  test("an unknown fdw_theme cookie falls back to the default theme", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: "fdw_theme",
        value: "definitely-not-a-theme",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aurora");
  });

  test("Einstellungen shows the switcher with Aurora active", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/einstellungen");
    await expect(
      page.getByRole("heading", { name: "Darstellung" }),
    ).toBeVisible();
    const swatch = page.getByTestId("theme-swatch-aurora");
    await expect(swatch).toBeVisible();
    await expect(swatch).toHaveAttribute("aria-pressed", "true");
    await expect(swatch.getByText("Aktiv")).toBeVisible();
  });

  test("submitting the switcher sets the fdw_theme cookie and keeps the theme applied", async ({
    page,
    context,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/einstellungen");
    await page.getByTestId("theme-swatch-aurora").click();
    await page.waitForURL(/\/app\/einstellungen/);
    const cookies = await context.cookies();
    const themeCookie = cookies.find((c) => c.name === "fdw_theme");
    expect(themeCookie?.value).toBe("aurora");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aurora");
  });
});
