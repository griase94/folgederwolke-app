/**
 * @aurora-impl-b1
 *
 * Aurora implementation campaign — B1 (Buchen · Listen-Kette). Behaviour
 * smokes for the transaktionen feed's plate anatomy + the Betrag sort lens +
 * the type-list KPI strips. testid/role selectors only (no copy coupling); the
 * seeded Aurora canon (Julia Brunner roster) supplies the rows.
 */
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) test.skip();
});

/** Absolute euro magnitude of a formatted amount cell ("+209,07 €" → 209.07). */
function magnitude(text: string): number {
  const digits = text.replace(/[^\d,]/g, "").replace(",", ".");
  return Math.abs(parseFloat(digits));
}

test.describe("@aurora-impl-b1 Transaktionen Listen-Kette", () => {
  test("Datum lens (default): month groups with a Netto subtotal + a grand foot", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    // ?year=all surfaces all three kinds (corpus donations sit in earlier years).
    await page.goto("/app/transaktionen?year=all");
    await expect(
      page.getByRole("heading", { name: "Transaktionen" }),
    ).toBeVisible();

    // Rows render, months carry a signed Netto subtotal, and the foot carries
    // the whole-set grand total (server aggregate, not a per-page sum).
    expect(await page.getByTestId("txn-row").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("month-subtotal").first()).toBeVisible();
    await expect(page.getByTestId("feed-total")).toBeVisible();
  });

  test("Betrag lens: ABS-desc ranking, months lifted, one grand total", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app/transaktionen?year=all&sort=betrag");

    // The lens announcement band shows, the month headers are gone, and the
    // grand-total foot stays.
    await expect(page.getByTestId("feed-flatband")).toBeVisible();
    await expect(page.getByTestId("month-subtotal")).toHaveCount(0);
    await expect(page.getByTestId("feed-total")).toBeVisible();

    // Largest first: the first row's magnitude is >= the second's.
    const amounts = page.getByTestId("txn-row-amount");
    expect(await amounts.count()).toBeGreaterThan(1);
    const first = magnitude((await amounts.nth(0).innerText()) ?? "");
    const second = magnitude((await amounts.nth(1).innerText()) ?? "");
    expect(first).toBeGreaterThanOrEqual(second);
  });

  test("invalid ?sort falls back to the Datum lens (no 500)", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    const res = await page.goto("/app/transaktionen?year=all&sort=voll-kaputt");
    expect(res?.status()).toBe(200);
    // Datum behaviour: month groups present, no Betrag announcement band.
    await expect(page.getByTestId("month-subtotal").first()).toBeVisible();
    await expect(page.getByTestId("feed-flatband")).toHaveCount(0);
  });

  test("type lists carry a KPI strip (Ausgaben tiles + Einnahmen Sphären-Split)", async ({
    page,
  }) => {
    await loginAs(page, "admin");

    await page.goto("/app/ausgaben");
    await expect(page.getByTestId("kpi-strip")).toBeVisible();

    await page.goto("/app/einnahmen");
    const split = page.locator('[data-slot="sphere-split"]');
    await expect(split).toBeVisible();
    // All four steuerliche Sphären are always shown (empty ones as 0,00 €).
    for (const sphere of [
      "ideeller",
      "vermoegen",
      "zweckbetrieb",
      "wirtschaftlich",
    ]) {
      await expect(
        split.locator(`[data-sphere-chip][data-sphere="${sphere}"]`),
      ).toBeVisible();
    }
  });
});
