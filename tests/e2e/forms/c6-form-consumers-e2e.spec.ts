/**
 * @phase-9 C6-FORM consumer migrations — Night 2 E4
 *
 * End-to-end coverage for the DateField primitive driving the public Auslage
 * form via TT.MM.JJJJ keyboard input → ISO YYYY-MM-DD on the hidden mirror.
 *
 * A-flow S1: the form is the extern-only BATCH form and uses the HERO DateField
 * (dynamic per-block name), so the field + hidden mirror are selected by their
 * kit data-testids rather than a fixed `#rechnungsdatum` id.
 */
import { test, expect } from "@playwright/test";

test.describe("@phase-9 C6-FORM consumer migrations (DateField)", () => {
  test("AuslagenForm: TT.MM.JJJJ typed → hidden ISO mirror carries YYYY-MM-DD", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-einreichen");
    if (res?.status() === 404) {
      throw new Error(
        "GET /auslage-einreichen returned 404 — PUBLIC_FORM_ENABLED is off in .env.test.",
      );
    }
    await page.waitForLoadState("networkidle");

    const field = page.getByTestId("date-field-input").first();
    await expect(field).toHaveAttribute("placeholder", "TT.MM.JJJJ");

    await field.fill("21.05.2026");
    await field.blur();

    await expect(field).toHaveValue("21.05.2026");
    const hidden = page
      .locator('[data-testid="date-field"] input[type="hidden"]')
      .first();
    await expect(hidden).toHaveValue("2026-05-21");
  });

  test("AuslagenForm: invalid calendar date (30.02.2026) clears the ISO mirror", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-einreichen");
    if (res?.status() === 404) test.skip();
    await page.waitForLoadState("networkidle");

    const field = page.getByTestId("date-field-input").first();
    await field.fill("30.02.2026");
    await field.blur();

    const hidden = page
      .locator('[data-testid="date-field"] input[type="hidden"]')
      .first();
    await expect(hidden).toHaveValue("");
    await expect(field).toHaveAttribute("aria-invalid", "true");
  });
});
