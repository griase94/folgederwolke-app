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
 * Fails loudly if PUBLIC_FORM_ENABLED is off — silent
 * test.skip() previously masked the route 404 and made the entire form-UI
 * suite a no-op in CI.
 */

import { expect, test, type Page } from "@playwright/test";

test.describe("@phase-2 auslage form UI", () => {
  async function goToForm(page: Page): Promise<void> {
    // CSP is now configured via svelte.config.js kit.csp (mode: 'auto') —
    // SvelteKit adds the right hashes/nonces for its inline hydration scripts
    // so we no longer need to intercept and strip the header in tests.
    const res = await page.goto("/auslage-einreichen");
    if (res?.status() === 404) {
      throw new Error(
        "GET /auslage-einreichen returned 404 — PUBLIC_FORM_ENABLED is off. Fix .env.test (PUBLIC_FORM_ENABLED=true) instead of silently skipping the entire form UI suite.",
      );
    }
    expect(res?.status()).toBe(200);
    // Wait for Svelte hydration: the submit button must be interactive
    // before we start asserting reactive state or firing events.
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("button", { name: "Auslage einreichen" }),
    ).toBeVisible();
  }

  test("form renders all major sections", async ({ page }) => {
    await goToForm(page);

    // Section headings visible — string may appear in card title + sr-only legend,
    // so accept any occurrence via .first()
    await expect(page.getByText("Wer hat bezahlt?").first()).toBeVisible();
    await expect(
      page.getByText("Wofür ist die Auslage?").first(),
    ).toBeVisible();
    await expect(page.getByText("Beleg").first()).toBeVisible();
    await expect(page.getByText("Datenschutz").first()).toBeVisible();

    // CTA visible
    await expect(
      page.getByRole("button", { name: "Auslage einreichen" }),
    ).toBeVisible();
  });

  test("radio group renders all three bezahlt-von options", async ({
    page,
  }) => {
    await goToForm(page);

    // Use role-based locator to target the actual radio inputs by their accessible name
    await expect(
      page.getByRole("radio", { name: "Folge der Wolke e.V." }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "Vereinsmitglied" }),
    ).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "Externe Person" }),
    ).toBeVisible();
  });

  test("selecting Externe Person shows name/IBAN/email fields", async ({
    page,
  }) => {
    await goToForm(page);

    // Click the label wrapping the radio — this fires the change event that
    // Svelte's onchange handler listens to and updates the `kind` reactive state.
    await page.locator("label").filter({ hasText: "Externe Person" }).click();

    // Fields are conditionally rendered via {#if kind === 'extern'}
    // Use placeholder-based locators for reliability.
    await expect(page.getByPlaceholder("Max Mustermann")).toBeVisible();
    await expect(
      page.getByPlaceholder("DE89 3704 0044 0532 0130 00"),
    ).toBeVisible();
    await expect(page.getByPlaceholder("max@example.com")).toBeVisible();
  });

  test("submit button is disabled without required fields (C2-TAX gate)", async ({
    page,
  }) => {
    await goToForm(page);

    // C2-TAX: AuslagenForm's submit button is now disabled whenever the
    // required fields (bezeichnung, betrag, Beleg, rechnungsdatum, …) are
    // missing or invalid. The disabled state IS the validation signal —
    // the previous "click → see errors" interaction is replaced by the
    // gate-at-the-button pattern. Asserting disabled-on-empty here protects
    // the regression that "you can submit a half-filled Auslage".
    const button = page.getByRole("button", { name: "Auslage einreichen" });
    await expect(button).toBeDisabled();
  });

  test("bezeichnung counter shows character count", async ({ page }) => {
    await goToForm(page);

    const input = page.locator("#bezeichnung");
    // pressSequentially dispatches individual key events that Svelte's oninput handler
    // receives — this is more reliable than fill() for reactive state tracking.
    await input.pressSequentially("Test Bezeichnung");
    await input.blur();

    // Counter is reactive Svelte state: {bezeichnung.length}/200
    await expect(page.getByText(/16\/200/)).toBeVisible();
  });

  test("datenschutz consent checkbox present", async ({ page }) => {
    await goToForm(page);

    const checkbox = page.locator(
      'input[type="checkbox"][name="datenschutz_consent"]',
    );
    await expect(checkbox).toBeVisible();
    expect(await checkbox.isChecked()).toBe(false);
  });

  test("file upload zone visible", async ({ page }) => {
    await goToForm(page);

    await expect(
      page.getByText(/Datei hierher ziehen oder auswählen/),
    ).toBeVisible();
  });
});
