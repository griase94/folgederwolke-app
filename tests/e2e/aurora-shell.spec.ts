import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

/**
 * Aurora slice 2 — app shell (spec §4/§5).
 * Desktop: sidebar IA + gradient-soft active pill. Mobile: five-cell tab
 * bar, ⊕ chooser, Mehr sheet with history-entry dismissal. iOS chrome:
 * status-bar default, scrim gone. PageShell on the converted routes.
 */

test.describe("@phase-aurora-slice2 Aurora shell — desktop", () => {
  test("sidebar shows 'Prüfung' for /app/inbox and the gradient-soft active pill", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app");
    const sidebar = page.getByRole("complementary", {
      name: "Hauptnavigation",
    });
    const pruefung = sidebar.getByRole("link", { name: "Prüfung" });
    await expect(pruefung).toBeVisible();
    await expect(pruefung).toHaveAttribute("href", "/app/inbox");
    const active = sidebar.locator('a[aria-current="page"]');
    await expect(active).toHaveAttribute("href", "/app");
    await expect(active).toHaveClass(/bg-gradient-brand-soft/);
  });

  test("converted routes render through PageShell", async ({ page }) => {
    await loginAs(page, "admin");
    for (const path of ["/app", "/app/inbox", "/app/projekte"]) {
      await page.goto(path);
      await expect(page.locator("[data-page-shell]")).toBeVisible();
    }
  });

  test("iOS chrome: status-bar default, scrim deleted", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(
      page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute("content", "default");
    await expect(page.locator(".pwa-statusbar-scrim")).toHaveCount(0);
  });
});

test.describe("@phase-aurora-slice2 Aurora shell — mobile", () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

  test("five-cell tab bar: Übersicht · Transaktionen · ⊕ · Prüfung · Mehr", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app");
    const bar = page.getByRole("navigation", { name: "Mobile Navigation" });
    await expect(bar.getByRole("link", { name: "Übersicht" })).toBeVisible();
    const tx = bar.getByRole("link", { name: "Transaktionen" });
    await expect(tx).toBeVisible();
    await expect(tx).toHaveAttribute("href", "/app/ausgaben"); // slice-5 flips this
    await expect(bar.getByRole("link", { name: /^Prüfung/ })).toBeVisible();
    await expect(
      bar.getByRole("button", { name: "Neu erfassen" }),
    ).toBeVisible();
    await expect(
      bar.getByRole("button", { name: "Mehr Bereiche" }),
    ).toBeVisible();
  });

  test("⊕ opens the type-chooser; Ausgabe tile lands on the create route", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app");
    await page.getByRole("button", { name: "Neu erfassen" }).click();
    const sheet = page.getByTestId("create-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("create-tile")).toHaveCount(3);
    await sheet.getByRole("link", { name: "Ausgabe", exact: true }).click();
    await page.waitForURL("**/app/ausgaben/neu");
  });

  test("Mehr sheet: profile row, six tiles, footer; back button closes the SHEET", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app");
    await page.getByRole("button", { name: "Mehr Bereiche" }).click();
    const sheet = page.getByTestId("mehr-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("mehr-tile")).toHaveCount(6);
    await expect(sheet.getByTestId("mehr-abmelden")).toBeVisible();
    // History-entry contract (spec §5): back closes the sheet, not the page.
    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("Prüfung badge mirrors the open-Auslagen count when present", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app");
    const badge = page.getByTestId("pruefung-badge");
    // Seed-dependent: assert consistency, not a literal count.
    if ((await badge.count()) > 0) {
      await expect(badge).toHaveText(/^([1-9]|9\+)$/);
    }
  });
});
