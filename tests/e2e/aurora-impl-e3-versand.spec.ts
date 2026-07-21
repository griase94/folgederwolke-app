import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

/**
 * Aurora E3 — Versand-Pfad UI smokes (@aurora-impl-e3).
 *
 * testid / role / label selectors only. Covers the reachable UI states of the
 * send action: the Kategorie-Pflicht gate on the form, and the send gate on a
 * fresh (PDF-less) invoice. The send round-trip itself (sent_mails write,
 * dedup, resend, mail attachment, gate guards) is asserted deterministically
 * in tests/integration/invoice-versand.test.ts — generating the PDF through
 * the built server's fire-and-forget job is not reliable enough for an e2e.
 */

/** Open a Rechnung's detail by business id via the list. */
async function openInvoice(page: Page, businessId: string): Promise<void> {
  await page.goto("/app/rechnungen");
  await page
    .getByTestId("invoice-row")
    .filter({ hasText: businessId })
    .getByRole("link")
    .first()
    .click();
  await page.waitForURL(/\/app\/rechnungen\/[0-9a-f-]{36}/);
}

test.describe("@aurora-impl-e3 Versand-Pfad", () => {
  test("send action is gated on the PDF for a fresh invoice", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    // FDW-2026-006 is seeded with pdf_status='not_generated' → the send action
    // is disabled with a visible gate-line reason (never a silent grey button).
    await openInvoice(page, "FDW-2026-006");

    await expect(page.getByTestId("invoice-send-mail-disabled")).toBeVisible();
    await expect(page.getByTestId("invoice-send-gate-reason")).toContainText(
      "PDF muss zuerst erzeugt werden",
    );
    // Not yet sent → no Versand card.
    await expect(page.getByTestId("invoice-versand-card")).toHaveCount(0);
  });

  test("Kategorie is mandatory on the Rechnungsformular (client gate)", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/rechnungen/new");

    const submit = page.getByRole("button", { name: "Rechnung erstellen" });
    await expect(submit).toBeDisabled();

    // Fill everything EXCEPT the Kategorie — the gate must still hold.
    await page.locator('select[name="customerId"]').selectOption({ index: 1 });
    await page.locator('input[name="nettoEur"]').fill("150,00");
    await page
      .locator('input[name="leistungszeitraum"]')
      .fill("September 2026");
    await page
      .locator('input[name="bezeichnung"]')
      .fill("Beratung Herbstprogramm 2026");
    await expect(submit).toBeDisabled();

    // Pick a Kategorie → the gate clears.
    await page.locator('select[name="kategorieId"]').selectOption({ index: 1 });
    await expect(submit).toBeEnabled();
  });

  test("flash toast fires on the interactive path and does NOT repeat on reload", async ({
    page,
  }) => {
    await loginAs(page, "admin");

    // Create a fresh invoice (keeps the canon offen/bezahlt counts untouched),
    // then mark it paid — the mark-paid + flash path shares the afterNavigate
    // handler with the send flow, so it proves the toast fix without the flaky
    // PDF-generation dependency. Board Major 1: the flash must fire on the
    // interactive (use:enhance) redirect AND must not re-fire on reload.
    await page.goto("/app/rechnungen/new");
    await page.locator('select[name="customerId"]').selectOption({ index: 1 });
    await page.locator('input[name="nettoEur"]').fill("80,00");
    await page.locator('input[name="leistungszeitraum"]').fill("Oktober 2026");
    await page
      .locator('input[name="bezeichnung"]')
      .fill("Toast-Beweis Rechnung Oktober 2026");
    await page.locator('select[name="kategorieId"]').selectOption({ index: 1 });
    await page.getByRole("button", { name: "Rechnung erstellen" }).click();
    await page.waitForURL(/\/app\/rechnungen\/[0-9a-f-]{36}/);

    // Mark paid (interactive) → the flash toast must appear.
    await page.getByTestId("invoice-mark-paid-open").click();
    await page.getByTestId("invoice-mark-paid-submit").click();
    await expect(page.getByText("Als bezahlt markiert")).toBeVisible();

    // The flash query param is stripped (shallow replaceState), so a reload
    // must NOT re-fire the toast.
    await page.reload();
    await expect(page.getByText("Als bezahlt markiert")).toHaveCount(0);
  });
});
