import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

/**
 * F2 dataviz smoke (@aurora-impl-f2).
 *
 * Behaviour smokes from the F2 acceptance criteria — data-testid selectors
 * only, no copy coupling:
 *   1. the dashboard leads with the Saldo-Verlauf sparkline hero (an <svg>
 *      renders and the hero prints the current stand with a €), and
 *   2. the desktop hover layer works — hovering the sparkline surfaces the
 *      fixed readout card (its inline opacity flips 0 → 1), plus the
 *      Sphären dense mini-bars adopt the dataviz component.
 */
test.describe("@aurora-impl-f2 F2 dataviz", () => {
  test("dashboard leads with the Saldo-Verlauf sparkline hero", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app");

    const hero = page.getByTestId("saldo-verlauf");
    await expect(hero).toBeVisible();
    // the sparkline is an actual SVG
    await expect(page.getByTestId("saldo-spark")).toBeVisible();
    // the hero figure prints the current stand as money
    await expect(page.getByTestId("saldo-hero")).toContainText("€");

    // the Lage card adopts the dense sphere mini-bars
    await expect(page.getByTestId("sphaeren-bars-dense")).toBeVisible();
  });

  test("desktop hover surfaces the sparkline readout card", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/app");

    const readout = page.getByTestId("saldo-readout");
    // rendered on a fine-pointer device, resting at opacity 0
    await expect(readout).toHaveAttribute("style", /opacity:\s*0/);

    // hover the sparkline → the readout card fades in (opacity → 1)
    await page.getByTestId("saldo-spark").hover();
    await expect(readout).toHaveAttribute("style", /opacity:\s*1/);
  });
});
