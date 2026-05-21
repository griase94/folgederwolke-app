/**
 * @phase-9 C1-PRJ-A — Projekte first-class Phase 1.
 *
 * Covers:
 *   1. /app/projekte list shows a SaldoPill per row
 *   2. /app/projekte/[id] hero: 5 KpiTile + CTA rail + 2 tabs
 *   3. ?projectId= prefill on /transactions/neu (project picker rendered)
 *   4. +Rechnung CTA carries ?projectId=X&from=projekt + renders the
 *      "Aus Projekt" indicator on /rechnungen/new
 *
 * Strategy: signs in as admin, seeds two scenarios via direct DB writes
 * (positive-saldo + negative-saldo projects under a far-future fixture
 * year so the test isn't perturbed by drift in seed totals).
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function signIn(page: Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  try {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
    await client`
      INSERT INTO magic_links (token_hash, email_canonical, expires_at)
      VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
    `;
    await page.goto(`/sign-in/verify?token=${rawToken}`);
    const mismatch = page.locator("text=Ja, trotzdem fortfahren");
    if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
      await mismatch.click();
    }
    await Promise.all([
      page.waitForURL(/\/app/, { timeout: 15_000 }),
      page.click('button[type="submit"]'),
    ]);
  } finally {
    await client.end();
  }
}

async function seedProjectWithSaldo(
  einnahmenCents: number,
  ausgabenCents: number,
  tag: string,
): Promise<string> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DIRECT_DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const FY = 2098;
  // Numeric-only suffix (business_id format check is digits-only after the
  // year prefix). 9 random digits keeps collisions vanishingly unlikely
  // across a single test run.
  const suffix = String(Math.floor(Math.random() * 1_000_000_000)).padStart(
    9,
    "0",
  );
  try {
    const [proj] = await client<
      { id: string }[]
    >`INSERT INTO projects (business_id, name) VALUES (${`P-${FY}-${suffix}`}, ${`C1PRJA-${tag}-${suffix}`}) RETURNING id`;
    if (!proj) throw new Error("seed project failed");
    const projectId = proj.id;

    const [kI] = await client<
      { id: string; name: string; sphere: string }[]
    >`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`;
    const [kE] = await client<
      { id: string; name: string; sphere: string }[]
    >`SELECT id, name, sphere FROM kategorien WHERE kind='expense' LIMIT 1`;
    if (!kI || !kE) throw new Error("seed kategorien missing");

    const TS = `${FY}-04-05 10:00:00+01`;

    if (einnahmenCents > 0) {
      await client`
        INSERT INTO income (
          business_id, gebucht_am, betrag_cents, bezeichnung,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot, project_id
        ) VALUES (
          ${`E-${FY}-${suffix}`}, ${TS}, ${einnahmenCents},
          ${`c1prja-${tag} inc`}, ${kI.id}, ${kI.name}, ${kI.sphere}::sphere,
          ${projectId}::uuid
        )`;
    }
    if (ausgabenCents > 0) {
      await client`
        INSERT INTO expenses (
          business_id, gebucht_am, betrag_cents, bezeichnung,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot,
          bezahlt_von_kind, bezahlt_von_display, status, project_id
        ) VALUES (
          ${`A-${FY}-${suffix}`}, ${TS}, ${ausgabenCents},
          ${`c1prja-${tag} exp`}, ${kE.id}, ${kE.name}, ${kE.sphere}::sphere,
          'verein', 'Verein', 'zu_pruefen', ${projectId}::uuid
        )`;
    }
    return projectId;
  } finally {
    await client.end();
  }
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"] || !process.env["DIRECT_DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-9 C1-PRJ-A Projekte first-class Phase 1", () => {
  test("Projekte list rows render a saldo pill (positive → emerald, negative → rose)", async ({
    page,
  }) => {
    const posId = await seedProjectWithSaldo(20000, 5000, "POS");
    const negId = await seedProjectWithSaldo(1000, 20000, "NEG");

    await signIn(page);
    await page.goto("/app/projekte");

    const posRow = page.locator(
      `[data-testid="project-row"][data-project-id="${posId}"]`,
    );
    await expect(posRow).toBeVisible();
    const posPill = posRow.getByTestId("saldo-pill");
    await expect(posPill).toHaveAttribute("data-saldo-sign", "positive");
    await expect(posPill).toHaveClass(/emerald/);

    const negRow = page.locator(
      `[data-testid="project-row"][data-project-id="${negId}"]`,
    );
    await expect(negRow).toBeVisible();
    const negPill = negRow.getByTestId("saldo-pill");
    await expect(negPill).toHaveAttribute("data-saldo-sign", "negative");
    await expect(negPill).toHaveClass(/rose/);
  });

  test("Project detail hero renders 5 KpiTiles + CtaRail (3 CTAs + Edit) + 2 tabs", async ({
    page,
  }) => {
    const projectId = await seedProjectWithSaldo(10000, 4000, "HERO");

    await signIn(page);
    await page.goto(`/app/projekte/${projectId}`);

    const hero = page.getByTestId("project-detail-hero");
    await expect(hero).toBeVisible();
    await expect(page.getByTestId("project-kpi-tile")).toHaveCount(5);
    await expect(page.getByTestId("project-cta-rail")).toBeVisible();
    await expect(page.getByTestId("project-cta")).toHaveCount(3);
    await expect(page.getByTestId("project-cta-edit")).toBeVisible();

    // Two tabs only — scope-guard reminder.
    await expect(page.getByTestId("project-tab")).toHaveCount(2);

    // Default tab = Übersicht
    await expect(page.getByTestId("project-overview-tab")).toBeVisible();

    // Switch to Transaktionen → table renders with seeded rows.
    await page.getByTestId("project-tab").nth(1).click();
    const txnTab = page.getByTestId("project-transactions-tab");
    await expect(txnTab).toBeVisible();
    await expect(txnTab.locator("tbody tr")).toHaveCount(2);
  });

  test("+Rechnung CTA carries ?projectId=X&from=projekt; rechnungen/new shows the Aus-Projekt hint", async ({
    page,
  }) => {
    const projectId = await seedProjectWithSaldo(0, 0, "CTA");

    await signIn(page);
    await page.goto(`/app/projekte/${projectId}`);

    const rechnungCta = page
      .getByTestId("project-cta")
      .filter({ hasText: "+Rechnung" });
    await expect(rechnungCta).toBeVisible();
    await rechnungCta.click();
    await expect(page).toHaveURL(/\/app\/rechnungen\/new\?.*projectId=/);
    await expect(page).toHaveURL(/from=projekt/);
    await expect(page.getByTestId("invoice-from-projekt")).toBeVisible();
  });

  test("/transactions/neu renders project picker; ?projectId= preselects it", async ({
    page,
  }) => {
    const projectId = await seedProjectWithSaldo(0, 0, "PICK");

    await signIn(page);
    await page.goto(
      `/app/transactions/neu?kind=einnahme&projectId=${projectId}`,
    );

    const picker = page.getByTestId("transaction-project-picker");
    await expect(picker).toBeVisible();
    await expect(picker).toHaveValue(projectId);
  });
});
