/**
 * @phase-9 C6-FORM consumer migrations — Night 2 E4
 *
 * End-to-end coverage for the DateField primitive driving a migrated form
 * via TT.MM.JJJJ keyboard input → ISO YYYY-MM-DD on the server payload.
 *
 * The AuslagenForm migration is the focal target here because it is the
 * single public-facing form in scope (the others all live behind admin
 * sign-in), and its server action is a fast multipart POST that we can
 * drive without a Drive upload (the route's body-size guard + Zod schema
 * cover the same ISO parsing path used by every other migrated form).
 *
 * The check is intentionally narrow: type TT.MM.JJJJ, blur, verify the
 * hidden ISO mirror carries YYYY-MM-DD. End-to-end submission goes through
 * tests/e2e/auslage-form.spec.ts already.
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

    // The migrated field renders the DateField TT.MM.JJJJ placeholder.
    const field = page.locator("input#rechnungsdatum");
    await expect(field).toHaveAttribute("placeholder", "TT.MM.JJJJ");

    // Clear the default-today value, type a fresh German-format date, blur.
    await field.fill("");
    await field.fill("21.05.2026");
    await field.blur();

    // After blur the visible input normalises to TT.MM.JJJJ and the hidden
    // sibling input (name="rechnungsdatum") carries the ISO YYYY-MM-DD —
    // which is what the route's Zod schema parses unchanged.
    await expect(field).toHaveValue("21.05.2026");
    const hidden = page.locator('input[type="hidden"][name="rechnungsdatum"]');
    await expect(hidden).toHaveValue("2026-05-21");
  });

  test("AuslagenForm: invalid calendar date (30.02.2026) clears the ISO mirror", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-einreichen");
    if (res?.status() === 404) test.skip();
    await page.waitForLoadState("networkidle");

    const field = page.locator("input#rechnungsdatum");
    await field.fill("");
    await field.fill("30.02.2026");
    await field.blur();

    const hidden = page.locator('input[type="hidden"][name="rechnungsdatum"]');
    await expect(hidden).toHaveValue("");
    await expect(field).toHaveAttribute("aria-invalid", "true");
  });
});
