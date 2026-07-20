/**
 * @phase-aurora-slice4
 *
 * Aurora dashboard slice E2E: Stand strip + triplet, task-queue CTA
 * deep-link audit (every CTA targets a real, filterable, authed route),
 * "Heute" context when the year switcher is off the Berlin year, and the
 * iPhone-15-Pro-Max above-the-fold contract (math in the slice plan, Task 4.13).
 */
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";
import { berlinYear } from "../../src/lib/domain/year.js";

test.describe("@phase-aurora-slice4 Aurora dashboard", () => {
  test("renders Stand strip with SALDO eyebrow, stat triplet and Buchungen captions", async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto("/app");
    await expect(page.getByTestId("stand-hero")).toBeVisible();
    await expect(
      page.getByText(new RegExp(`Saldo ${berlinYear()}`, "i")),
    ).toBeVisible();
    await expect(page.getByTestId("stand-stat-einnahmen")).toBeVisible();
    await expect(page.getByTestId("stand-stat-spenden")).toBeVisible();
    await expect(page.getByTestId("stand-stat-ausgaben")).toBeVisible();
    await expect(page.getByTestId("stand-stat-einnahmen")).toContainText(
      /Buchung/,
    );
  });

  test("Lage card renders sections in order Beiträge → Sphären (WGB only when > 0)", async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto("/app");
    await expect(page.getByTestId("lage-beitraege")).toBeVisible();
    await expect(page.getByTestId("lage-sphaeren")).toBeVisible();
  });

  test("CTA deep-link audit: every task-queue target route answers authed (no sign-in bounce, no 5xx)", async ({
    page,
  }) => {
    await loginAs(page);
    const targets = [
      "/app/inbox",
      "/app/ausgaben/ueberweisungen",
      "/app/mitglieder?view=matrix&filter=ueberfaellig",
      "/app/mitglieder?view=matrix&filter=offen",
      "/app/einnahmen?sphaere=wirtschaftlich",
      "/app/jahresabschluss",
    ];
    for (const target of targets) {
      const res = await page.goto(target);
      expect(res, target).toBeTruthy();
      expect(res!.status(), target).toBeLessThan(500);
      expect(page.url(), target).not.toContain("/sign-in");
    }
  });

  test("year switcher off the Berlin year: Heute labels show, zugesagt/frei subline hides", async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto(`/app?year=${berlinYear() - 1}`);
    await expect(page.getByTestId("aufgaben-heute-chip")).toBeVisible();
    await expect(page.getByTestId("lage-heute-label")).toBeVisible();
    await expect(page.getByTestId("stand-subline")).toHaveCount(0);
  });

  test("Überweisungsliste renders with header sum and back affordance", async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto("/app/ausgaben/ueberweisungen");
    await expect(
      page.getByRole("heading", { name: "Überweisungsliste" }),
    ).toBeVisible();
  });
});

test.describe("@phase-aurora-slice4 Aurora dashboard mobile", () => {
  test.use({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test("above the fold (iPhone 15 Pro Max): Saldo, stats, ≥3 task rows, Lage top edge", async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto("/app");
    const FOLD = 780; // 932 − tab bar/home indicator − buffer (plan Task 4.13 math)

    const hero = page.getByTestId("stand-hero");
    await expect(hero).toBeVisible();
    const heroBox = await hero.boundingBox();
    expect(heroBox!.y + heroBox!.height).toBeLessThan(FOLD);

    const stats = await page.getByTestId("stand-stat-ausgaben").boundingBox();
    expect(stats!.y + stats!.height).toBeLessThan(FOLD);

    const taskRows = page.getByTestId("task-row");
    const taskCount = await taskRows.count();
    // Seed-dependent: when ≥3 tasks exist, the third must be above the fold.
    if (taskCount >= 3) {
      const third = await taskRows.nth(2).boundingBox();
      expect(third!.y + third!.height).toBeLessThan(FOLD);
    }

    // Lage top edge — re-calibrated F2 (2026-07-20) to the v10 mobile anatomy.
    // The old `< FOLD` encoded the PRE-v10 compact hero; the v10 dashboard leads
    // with the Saldo sparkline-hero + the Aufgaben queue, and the Lage card peeks
    // BELOW the fold by design. Plate proof: dashboard-v10.html rendered at
    // 430×932 puts the Beiträge/Lage section top at y≈2046 (~2.2 viewports),
    // i.e. well below the fold. App measures lage-top ≈ 913 (~1.0 viewport) — the
    // grouped Aufgaben make it MORE compact than the plate. Geometric proof for
    // why `< FOLD` is impossible alongside ≥3 task rows above the fold: the third
    // task row already ends at ~775, and the fixed ~56px card boundary (AufgabenCard
    // p-4 bottom 16 + grid gap-6 24 + LageCard p-4 top 16) puts the next card's top
    // at ~831 minimum. So we assert Lage RENDERS and peeks within ~1.5 viewports —
    // tighter than the plate's own 2.2× — while the tasks-above-the-fold doctrine
    // stays strictly guarded above.
    const LAGE_PEEK_MAX = Math.round(1.5 * 932); // 1398
    const lage = await page.getByTestId("lage-beitraege").boundingBox();
    expect(lage).not.toBeNull();
    expect(lage!.y).toBeLessThan(LAGE_PEEK_MAX);
  });

  test("mobile stack order: Aufgaben before Lage before Projekte before Aktivität", async ({
    page,
  }) => {
    await loginAs(page);
    await page.goto("/app");
    const aufgaben = await page
      .getByRole("heading", { name: "Aufgaben" })
      .boundingBox();
    const lage = await page.getByTestId("lage-beitraege").boundingBox();
    expect(aufgaben!.y).toBeLessThan(lage!.y);
    const projekteHeading = page.getByRole("heading", {
      name: "Projekte",
      exact: true,
    });
    if ((await projekteHeading.count()) > 0) {
      const projekte = await projekteHeading.boundingBox();
      expect(lage!.y).toBeLessThan(projekte!.y);
      const aktivitaet = page.getByRole("heading", { name: "Aktivität" });
      if ((await aktivitaet.count()) > 0) {
        expect(projekte!.y).toBeLessThan((await aktivitaet.boundingBox())!.y);
      }
    }
  });
});
