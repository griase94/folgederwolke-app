/**
 * @phase-7.5 C9 — AT-002 fix verification.
 *
 * Asserts the public Auslagen form's project dropdown is populated. Before the
 * C9 fix the layout returned `projects: []`, so the <select id="wofuer-select">
 * either didn't render or had only the default option.
 */

import { expect, test } from "@playwright/test";

test.describe("@phase-7.5 C9 — public Auslagen project dropdown", () => {
  test("the project select renders with at least one project option", async ({
    page,
  }) => {
    const res = await page.goto("/auslage-einreichen?bezahltVonKind=verein");
    if (res?.status() === 404) {
      throw new Error(
        "GET /auslage-einreichen returned 404 — PUBLIC_FORM_ENABLED is off in .env.test.",
      );
    }
    expect(res?.status()).toBe(200);

    // The select is rendered conditionally on `projects.length > 0`. If AT-002
    // is fixed it appears. If not, it's missing entirely.
    const select = page.locator("#wofuer-select");
    await expect(select).toBeVisible();

    // Default option + ≥1 seeded project
    const optionCount = await select.locator("option").count();
    expect(optionCount).toBeGreaterThanOrEqual(2);
  });
});
