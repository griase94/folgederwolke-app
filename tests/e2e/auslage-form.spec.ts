/**
 * @phase-2
 *
 * E2E for the public Auslage form (Aurora A-flow S1): extern-only + multi-Auslage
 * batch. Asserts the form renders, the submit gate blocks an incomplete form, the
 * F2 cap hides "+ weitere Auslage" at MAX_BATCH_ITEMS, and the happy path (fill +
 * Beleg + submit) reaches the confirmation — single and batch.
 */
import { expect, test, type Page } from "@playwright/test";

// A valid 64×64 PNG — large enough that the server-side sharp thumbnail
// succeeds (a 1×1 trips a libpng read error, leaving a thumbnail-less files row
// that breaks the /app/files admin listing spec downstream).
const PNG_BELEG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAn0lEQVRoge2SQQkAQRDDKqzCTmcUrYh7hIFCBKSh4etpohuwAdUrsgv1LtEN2IDqFdmFepfoBmxA9YrsQr1LdAM2oHpFdqHeJboBG1C9IrtQ7xLdgA2oXpFdqHeJbsAGVK/ILtS7RDdgA6pXZBfqXaIbsAHVK7IL9S7RDdiA6hXZhXqX6AZsQPWK7EK9S3QDNqB6RXah3iW6ARtQveIfHgeIYWnw/5CEAAAAAElFTkSuQmCC",
  "base64",
);

// A distinct identity for the submit round-trips so the afterAll cleanup can
// remove exactly the submissions + Beleg files these tests create (they persist
// real rows + blobs; leaving them behind slows the downstream /app/files admin
// listing spec — spec isolation).
const FORM_EMAIL = "e2e-form-submit@example.test";

test.describe("@phase-2 auslage form (extern-only + batch)", () => {
  test.afterAll(async () => {
    const { default: postgres } = await import("postgres");
    const c = postgres(
      process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
      { prepare: false, max: 1 },
    );
    try {
      const rows = await c<{ beleg_file_id: string | null }[]>`
        DELETE FROM auslagen_submissions
        WHERE extern_email = ${FORM_EMAIL}
        RETURNING beleg_file_id`;
      const ids = rows
        .map((r) => r.beleg_file_id)
        .filter((id): id is string => Boolean(id));
      if (ids.length) await c`DELETE FROM files WHERE id = ANY(${ids})`;
    } finally {
      await c.end();
    }
  });

  async function goToForm(page: Page): Promise<void> {
    const res = await page.goto("/auslage-einreichen");
    if (res?.status() === 404) {
      throw new Error(
        "GET /auslage-einreichen returned 404 — PUBLIC_FORM_ENABLED is off. Fix .env.test (PUBLIC_FORM_ENABLED=true).",
      );
    }
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("auslage-submit")).toBeVisible();
  }

  async function fillIdentity(page: Page): Promise<void> {
    await page.getByPlaceholder("Vor- und Nachname").fill("E2E Form Tester");
    await page.getByPlaceholder("damit wir dich erreichen").fill(FORM_EMAIL);
    await page.getByPlaceholder(/^DE00/).fill("DE89 3704 0044 0532 0130 00");
  }

  // Fill the (currently open) block's fields + attach a Beleg. `scope` narrows
  // to a single block's subtree for the batch case.
  async function fillBlock(
    scope: Page | ReturnType<Page["locator"]>,
    { bez, betrag, datum }: { bez: string; betrag: string; datum: string },
  ): Promise<void> {
    await scope.getByPlaceholder("z. B. Getränke fürs Sommerfest").fill(bez);
    await scope.getByTestId("amount-field-input").fill(betrag);
    const dateInput = scope.getByTestId("date-field-input");
    await dateInput.fill(datum);
    await dateInput.blur();
    await scope.locator('input[type="file"]').first().setInputFiles({
      name: "beleg.png",
      mimeType: "image/png",
      buffer: PNG_BELEG,
    });
    // Wait for the compressed file to land in block state (BelegUpload preview).
    await expect(scope.getByText(/beleg\.png/i).first()).toBeVisible();
  }

  test("renders the extern identity, an Auslage, Beleg + consent + login nudge", async ({
    page,
  }) => {
    await goToForm(page);
    await expect(page.getByText("Wer bekommt's zurück?").first()).toBeVisible();
    await expect(page.getByText("Wofür war's?").first()).toBeVisible();
    await expect(page.getByPlaceholder(/^DE00/)).toBeVisible(); // extern IBAN, no radio
    // F3: canonical BelegUpload dropzone copy.
    await expect(
      page.getByText(/Beleg hier ablegen oder auswählen/).first(),
    ).toBeVisible();
    await expect(page.getByTestId("login-nudge")).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeVisible();
  });

  test("submit EXPLAINS the gap instead of sitting disabled (F1/C2-TAX)", async ({
    page,
  }) => {
    await goToForm(page);
    const submit = page.getByTestId("auslage-submit");
    // The primary is never disabled for a missing field — a disabled button
    // cannot explain itself (DESIGN-GUIDELINES §4).
    await expect(submit).toBeEnabled();
    await expect(page.getByTestId("einreichen-gate")).toBeVisible();

    // Clicking with an empty form jumps to the first gap and names it.
    await submit.click();
    await expect(page.locator("#ext-name")).toBeFocused();
    await expect(page.getByTestId("einreichen-gate")).toContainText("Name");

    // Once identity is filled, the gate moves on to the block's real gaps —
    // and names only what is actually still empty.
    await fillIdentity(page);
    await submit.click();
    const gate = page.getByTestId("einreichen-gate");
    await expect(gate).toContainText("Bezeichnung");
    await expect(gate).toContainText("Betrag");
  });

  test("project select is populated from the seeded projects (AT-002 guard)", async ({
    page,
  }) => {
    await goToForm(page);
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
    expect(await select.locator("option").count()).toBeGreaterThan(1);
  });

  test("F2: '+ weitere Auslage' disappears once the batch cap is reached", async ({
    page,
  }) => {
    await goToForm(page);
    // Start at 1 block; add until the cap (MAX_BATCH_ITEMS=10) hides the button.
    for (let i = 0; i < 9; i++) {
      await page.getByTestId("add-auslage").click();
    }
    await expect(page.getByTestId("add-auslage")).toHaveCount(0);
    expect(await page.getByTestId("auslage-block").count()).toBe(10);
  });

  test("happy path: fill one Auslage + Beleg → submit → confirmation", async ({
    page,
  }) => {
    await goToForm(page);
    await fillIdentity(page);
    await fillBlock(page, {
      bez: "Getränke fürs Sommerfest",
      betrag: "24,90",
      datum: "04.07.2026",
    });
    await page.getByRole("checkbox").check();
    await expect(page.getByTestId("auslage-submit")).toBeEnabled();
    await page.getByTestId("auslage-submit").click();
    // Server allocates a real AUS-Nr and 303s to the confirmation.
    await page.waitForURL(/\/auslage-eingereicht\?id=AUS-\d{4}-\d{3}/);
    await expect(page.getByTestId("eingereicht-heading")).toBeVisible();
    await expect(page.getByTestId("status-cta")).toBeVisible();

    // M1 regression (board #162): the compressed Beleg must persist a REAL
    // filename, never 'blob'. Assert the DB row the upload created.
    const { default: postgres } = await import("postgres");
    const c = postgres(
      process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "",
      { prepare: false, max: 1 },
    );
    try {
      const rows = await c<{ beleg_original_name: string | null }[]>`
        SELECT beleg_original_name FROM auslagen_submissions
        WHERE extern_email = ${FORM_EMAIL}
        ORDER BY submitted_at DESC LIMIT 1`;
      expect(rows[0]?.beleg_original_name).toBeTruthy();
      expect(rows[0]?.beleg_original_name).not.toBe("blob");
      expect(rows[0]?.beleg_original_name).toMatch(/\.(png|jpg|jpeg)$/i);
    } finally {
      await c.end();
    }
  });

  test("batch path: two Auslagen → submit → batch confirmation with a total", async ({
    page,
  }) => {
    await goToForm(page);
    await fillIdentity(page);
    // Block 1 (inline while it's the only one).
    await fillBlock(page, {
      bez: "Kuchen",
      betrag: "24,90",
      datum: "04.07.2026",
    });
    // Add a second block (it opens by default; block 1 collapses to a summary).
    await page.getByTestId("add-auslage").click();
    const block2 = page.getByTestId("auslage-block").nth(1);
    await fillBlock(block2, {
      bez: "Standmiete",
      betrag: "14,90",
      datum: "06.07.2026",
    });
    await page.getByRole("checkbox").check();
    await expect(page.getByTestId("auslage-submit")).toBeEnabled();
    await page.getByTestId("auslage-submit").click();
    await page.waitForURL(/\/auslage-eingereicht\?id=AUS-\d{4}-\d{3}/);
    await expect(page.getByTestId("eingereicht-heading")).toBeVisible();
    await expect(page.getByTestId("bcg-total")).toContainText("39,80");
  });
});
