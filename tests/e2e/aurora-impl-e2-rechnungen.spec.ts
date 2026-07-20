import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

/**
 * Aurora E2 — Rechnungs-Kette behaviour smokes (@aurora-impl-e2).
 *
 * testid / role selectors only. Runs against the seeded Rechnungs-Kanon
 * (FDW-2026-001…006: 270,00 € offen · 3 · 1 überfällig; next Nr. FDW-2026-007).
 * Serial: the create test's invoice is marked paid by the last test, so the
 * canon rows (001–006) are never mutated.
 */
test.describe.serial("@aurora-impl-e2 Rechnungs-Kette", () => {
  let createdInvoiceId = "";

  test("list shows the seeded open world (270,00 € · 3 offen · 1 überfällig)", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/rechnungen");

    // Header meta = server aggregate. Wait for the ledger to render first.
    await expect(
      page.getByRole("heading", { name: "Rechnungen" }),
    ).toBeVisible();
    await expect(page.getByTestId("invoice-row").first()).toBeVisible();
    await expect(page.locator("body")).toContainText("270,00");

    // Filter-chip counts (year-wide aggregate).
    await expect(page.getByTestId("rechnungen-chip-alle")).toContainText("6");
    await expect(page.getByTestId("rechnungen-chip-offen")).toContainText("3");
    await expect(
      page.getByTestId("rechnungen-chip-ueberfaellig"),
    ).toContainText("1");
    await expect(page.getByTestId("rechnungen-chip-bezahlt")).toContainText(
      "3",
    );

    // The one überfällig exemplar + an offen one carry the right chips.
    await expect(
      page.getByTestId("invoice-row").filter({ hasText: "FDW-2026-004" }),
    ).toContainText("überfällig");
    await expect(
      page.getByTestId("invoice-row").filter({ hasText: "FDW-2026-006" }),
    ).toContainText("offen");
  });

  test("kunde-detail „+ Rechnung“ prefills the customer and creates an invoice", async ({
    page,
  }) => {
    await loginAs(page, "admin");

    // Enter a customer's detail, jump to the Rechnungen tab, hit „+ Rechnung“.
    await page.goto("/app/kunden");
    await page
      .getByTestId("customer-row")
      .first()
      .getByRole("link")
      .first()
      .click();
    await expect(page).toHaveURL(/\/app\/kunden\/[0-9a-f-]{36}/);
    await page.getByTestId("tab-rechnungen").click();
    await page.getByTestId("neue-rechnung").click();

    // Landed on /new?customerId=… with the customer pre-selected.
    await expect(page).toHaveURL(/\/app\/rechnungen\/new\?customerId=/);
    const customerSelect = page.locator('select[name="customerId"]');
    await expect(customerSelect).not.toHaveValue("");

    await page
      .locator('input[name="bezeichnung"]')
      .fill("Fotodokumentation Herbstfest 2026");
    await page.locator('input[name="nettoEur"]').fill("150,00");
    // Leistungszeitraum is required (§ 14 Abs. 4 Nr. 6 UStG).
    await page
      .locator('input[name="leistungszeitraum"]')
      .fill("September 2026");
    // Pick an income kategorie so the later mark-paid can book the income
    // receipt (an invoice without a kategorie has no sphere to book against).
    await page.locator('select[name="kategorieId"]').selectOption({ index: 1 });

    await page
      .locator('button[type="submit"]:has-text("Rechnung erstellen")')
      .click();

    // 303 → the new invoice detail (?job=<pdf-job>). Capture the id for the
    // mark-paid test so we never touch the canonical 001–006.
    await page.waitForURL(/\/app\/rechnungen\/[0-9a-f-]{36}/);
    const m = /\/app\/rechnungen\/([0-9a-f-]{36})/.exec(page.url());
    createdInvoiceId = m?.[1] ?? "";
    expect(createdInvoiceId).not.toBe("");
    await expect(page.locator("body")).toContainText(
      "Fotodokumentation Herbstfest 2026",
    );
  });

  test("inline mark-paid marks the freshly created invoice as paid", async ({
    page,
  }) => {
    test.skip(createdInvoiceId === "", "depends on the create test");
    await loginAs(page, "admin");
    await page.goto("/app/rechnungen");

    // Scope to the desktop row list (the mobile card carries the same
    // data-invoice-id but is display:none at desktop width).
    const desktopList = page.getByTestId("invoice-row-list");
    const row = desktopList.locator(`[data-invoice-id="${createdInvoiceId}"]`);
    await expect(row).toBeVisible();
    await row.getByTestId("invoice-row-kebab").click();
    // The kebab menu renders in a portal at body level.
    await page.getByTestId("invoice-row-mark-paid").click();
    await page.getByTestId("invoice-mark-paid-submit").click();

    // 303 → ?paid=1; the row (still visible in „Alle") now reads bezahlt.
    await page.waitForURL(/\/app\/rechnungen(\?|$)/);
    await expect(
      desktopList.locator(`[data-invoice-id="${createdInvoiceId}"]`),
    ).toContainText("bezahlt");
  });
});
