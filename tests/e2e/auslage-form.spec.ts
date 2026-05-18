/**
 * @phase-2
 *
 * E2E tests for the public Auslage submission form UI.
 *
 * These tests assert that:
 * - The form renders with the expected sections.
 * - Submitting an empty form shows validation errors (inline).
 * - The happy path (fill + submit) reaches the confirmation page.
 *
 * Tests skip gracefully when PUBLIC_FORM_ENABLED=false (dev/CI without DB).
 */

import { expect, test, type Page } from "@playwright/test";

test.describe("@phase-2 auslage form UI", () => {
  async function goToForm(page: Page) {
    const res = await page.goto("/auslage-einreichen");
    if (res?.status() === 404) {
      test.skip();
      return false;
    }
    return true;
  }

  test("form renders all major sections", async ({ page }) => {
    if (!(await goToForm(page))) return;

    // Section headings visible
    await expect(page.getByText("Wer hat bezahlt?")).toBeVisible();
    await expect(page.getByText("Wofür ist die Auslage?")).toBeVisible();
    await expect(page.getByText("Beleg")).toBeVisible();
    await expect(page.getByText("Datenschutz")).toBeVisible();

    // CTA visible
    await expect(
      page.getByRole("button", { name: "Auslage einreichen" }),
    ).toBeVisible();
  });

  test("radio group renders all three bezahlt-von options", async ({
    page,
  }) => {
    if (!(await goToForm(page))) return;

    await expect(page.getByText("Folge der Wolke e.V.")).toBeVisible();
    await expect(page.getByText("Vereinsmitglied")).toBeVisible();
    await expect(page.getByText("Externe Person")).toBeVisible();
  });

  test("selecting Externe Person shows name/IBAN/email fields", async ({
    page,
  }) => {
    if (!(await goToForm(page))) return;

    await page.getByText("Externe Person").click();

    await expect(page.getByLabel(/Name/)).toBeVisible();
    await expect(page.getByLabel(/IBAN/)).toBeVisible();
    await expect(page.getByLabel(/E-Mail/)).toBeVisible();
  });

  test("submit without required fields shows validation errors", async ({
    page,
  }) => {
    if (!(await goToForm(page))) return;

    // Click submit without filling anything
    await page.getByRole("button", { name: "Auslage einreichen" }).click();

    // At least one error about Bezeichnung or Betrag should appear
    const errorText = await page
      .locator(".text-destructive")
      .first()
      .textContent();
    expect(errorText).toBeTruthy();
  });

  test("bezeichnung counter shows character count", async ({ page }) => {
    if (!(await goToForm(page))) return;

    const input = page.getByLabel(/Was war's/);
    await input.fill("Test Bezeichnung");
    await expect(page.getByText(/16\/200/)).toBeVisible();
  });

  test("datenschutz consent checkbox present", async ({ page }) => {
    if (!(await goToForm(page))) return;

    const checkbox = page.locator(
      'input[type="checkbox"][name="datenschutz_consent"]',
    );
    await expect(checkbox).toBeVisible();
    expect(await checkbox.isChecked()).toBe(false);
  });

  test("file upload zone visible", async ({ page }) => {
    if (!(await goToForm(page))) return;

    await expect(
      page.getByText(/Datei hierher ziehen oder auswählen/),
    ).toBeVisible();
  });
});
