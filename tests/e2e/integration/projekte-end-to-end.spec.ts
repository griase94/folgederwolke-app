/**
 * @phase-9 C1-PRJ-A end-to-end integration.
 *
 * Walks the full lifecycle that C1-PRJ-A enables:
 *
 *   1. Seed a project (direct DB) so we have a stable target.
 *   2. Visit /app/projekte/[id] → confirm the new hero is up and the
 *      Transaktionen tab starts empty.
 *   3. Seed an income row linked to that project (direct DB — keeps the
 *      test fast; the /transactions/neu form's `projectId` field is the
 *      mechanism, but driving the full form here would re-exercise the
 *      C2-TAX gates which already have their own spec).
 *   4. Reload the detail → confirm the row appears in the Transaktionen
 *      tab AND the Einnahmen + Saldo KPI tiles reflect it.
 *
 * This guards the wiring between projectFinancials, the detail-page load,
 * and the rendered hero — i.e. the "did the agg numbers actually plumb
 * through?" check that the unit tests can't make.
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

async function seedEmptyProject(tag: string): Promise<{
  projectId: string;
  suffix: string;
}> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DIRECT_DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const FY = 2097;
  // Numeric-only suffix — business_id format CHECK requires digits after the
  // year prefix.
  const suffix = String(Math.floor(Math.random() * 1_000_000_000)).padStart(
    9,
    "0",
  );
  try {
    const [proj] = await client<
      { id: string }[]
    >`INSERT INTO projects (business_id, name)
      VALUES (${`P-${FY}-${suffix}`}, ${`C1PRJA-E2E-${tag}-${suffix}`})
      RETURNING id`;
    if (!proj) throw new Error("seed project failed");
    return { projectId: proj.id, suffix };
  } finally {
    await client.end();
  }
}

async function addIncomeToProject(
  projectId: string,
  suffix: string,
  betragCents: number,
  bezeichnung: string,
): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DIRECT_DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const FY = 2097;
  const TS = `${FY}-04-05 10:00:00+01`;
  try {
    const [kI] = await client<
      { id: string; name: string; sphere: string }[]
    >`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`;
    if (!kI) throw new Error("seed kategorie missing");
    await client`
      INSERT INTO income (
        business_id, gebucht_am, geld_eingang_datum,
        betrag_cents, bezeichnung,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot, project_id
      ) VALUES (
        ${`E-${FY}-${suffix}`}, ${TS}, ${`${FY}-04-05`},
        ${betragCents}, ${bezeichnung},
        ${kI.id}, ${kI.name}, ${kI.sphere}::sphere, ${projectId}::uuid
      )`;
  } finally {
    await client.end();
  }
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"] || !process.env["DIRECT_DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-9 C1-PRJ-A end-to-end (lifecycle)", () => {
  test("project → add transaction → see it in detail Transaktionen tab + reflected in KPI tiles", async ({
    page,
  }) => {
    const { projectId, suffix } = await seedEmptyProject("LIFECYCLE");

    await signIn(page);

    // Stage 1: empty project → Transaktionen tab shows the empty state,
    // Einnahmen tile reads 0,00 €.
    await page.goto(`/app/projekte/${projectId}`);
    await expect(page.getByTestId("project-detail-hero")).toBeVisible();
    const einnahmenTile = page.locator(
      '[data-testid="project-kpi-tile"][data-kpi-label="Einnahmen"]',
    );
    await expect(einnahmenTile).toContainText("0,00");

    await page.getByTestId("project-tab").nth(1).click();
    const txnTab = page.getByTestId("project-transactions-tab");
    await expect(txnTab).toBeVisible();
    await expect(txnTab).toContainText(/keine Buchungen/i);

    // Stage 2: seed an income (12,50 € → 1250c) linked to the project.
    await addIncomeToProject(projectId, suffix, 1250, "Lifecycle income test");

    // Reload to pick up the new row (load() runs server-side).
    await page.reload();

    // Hero KPI tiles reflect the new income.
    await expect(einnahmenTile).toContainText(/12,50/);
    const saldoTile = page.locator(
      '[data-testid="project-kpi-tile"][data-kpi-label="Saldo"]',
    );
    await expect(saldoTile).toContainText(/12,50/);

    // Saldo pill flipped to positive.
    const saldoPill = page
      .getByTestId("project-detail-hero")
      .getByTestId("saldo-pill");
    await expect(saldoPill).toHaveAttribute("data-saldo-sign", "positive");

    // Transaktionen tab now contains the row.
    await page.getByTestId("project-tab").nth(1).click();
    const txnTab2 = page.getByTestId("project-transactions-tab");
    await expect(txnTab2).toContainText("Lifecycle income test");
    await expect(txnTab2).toContainText(/12,50/);
  });
});
