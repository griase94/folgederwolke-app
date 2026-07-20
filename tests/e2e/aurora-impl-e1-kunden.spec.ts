import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

/**
 * Aurora E1 — Kunden-Kette behaviour smokes (@aurora-impl-e1).
 *
 * data-testid / role selectors only (no copy coupling beyond the labels the
 * brief fixes). Covers the chain: create via the kit modal → row appears →
 * detail shows the KPI pair + tabs → archive with the confirm-check friction →
 * undo snack restores. Runs against the seeded Aurora canon.
 */
test.describe("@aurora-impl-e1 Kunden-Kette", () => {
  test("create a customer via the modal → it appears in the list", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/kunden");

    const name = `E2E Neukunde ${Date.now()}`;
    await page.getByTestId("add-customer").click();
    await page.getByTestId("add-cust-name-input").fill(name);
    await page.getByTestId("add-customer-submit").click();

    // The new customer surfaces as a row (invalidateAll reload).
    await expect(
      page.getByTestId("customer-row").filter({ hasText: name }),
    ).toBeVisible();
  });

  test("kunde-detail renders the KPI pair + the three tabs", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/kunden");

    // Open the first customer via its stretched row link.
    await page
      .getByTestId("customer-row")
      .first()
      .getByRole("link")
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/kunden\/[0-9a-f-]{36}/);

    await expect(page.getByTestId("kpi-offen")).toBeVisible();
    await expect(page.getByTestId("kpi-gesamt")).toBeVisible();
    await expect(page.getByTestId("tab-uebersicht")).toBeVisible();
    await expect(page.getByTestId("tab-rechnungen")).toBeVisible();
    await expect(page.getByTestId("tab-projekte")).toBeVisible();

    // Facts (Stammdaten) render on the Übersicht tab by default.
    await expect(page.getByTestId("customer-facts")).toBeVisible();

    // Switching tabs selects the Rechnungen tab (persisted in ?tab=).
    await page.getByTestId("tab-rechnungen").click();
    await expect(page.getByTestId("tab-rechnungen")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page).toHaveURL(/tab=rechnungen/);
  });

  test("archive a customer via the confirm-check → undo snack restores it", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/kunden");

    // Seed a throwaway customer to archive.
    const name = `E2E Archivkunde ${Date.now()}`;
    await page.getByTestId("add-customer").click();
    await page.getByTestId("add-cust-name-input").fill(name);
    await page.getByTestId("add-customer-submit").click();
    const row = page.getByTestId("customer-row").filter({ hasText: name });
    await expect(row).toBeVisible();

    // Kebab → Archivieren → confirm-check friction → archive.
    await row.getByRole("button", { name: /Aktionen/ }).click();
    await page.getByRole("menuitem", { name: "Archivieren" }).click();
    await page.getByTestId("archive-confirm-check").check();
    await page.getByTestId("archive-submit").click();

    // Undo snack appears; clicking it restores the customer.
    const undo = page.getByRole("button", { name: "Rückgängig" });
    await expect(undo).toBeVisible();
    await undo.click();

    // Restored → the row is back and reachable as an active customer.
    await expect(
      page.getByTestId("customer-row").filter({ hasText: name }),
    ).toBeVisible();
  });
});
