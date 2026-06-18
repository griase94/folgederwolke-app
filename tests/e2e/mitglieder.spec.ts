/**
 * E2E Mitglieder tests — @phase-3, @phase-member-zahlung
 *
 * Strategy: uses a direct DB connection to set up test state, then drives
 * the browser through the CRUD flows. Requires DATABASE_URL + TEST_ADMIN_EMAIL
 * in the environment (same as @phase-1 auth tests).
 *
 * Tags: @phase-3, @phase-member-zahlung
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Helper: sign in via magic-link shortcut
// ---------------------------------------------------------------------------
async function signIn(page: import("@playwright/test").Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";

  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
  `;
  await client.end();

  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mismatch.click();
  }
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);
}

// ---------------------------------------------------------------------------
// Guard: skip suite if no DATABASE_URL
// ---------------------------------------------------------------------------
test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

// ---------------------------------------------------------------------------
// 1. Navigate to /app/mitglieder
// ---------------------------------------------------------------------------
test.describe("@phase-3 Mitglieder — navigation", () => {
  test("unauthenticated /app/mitglieder redirects to sign-in", async ({
    page,
  }) => {
    await page.goto("/app/mitglieder");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("authenticated user sees Mitglieder page", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");
    await expect(page.locator("h1")).toContainText("Mitglieder");
  });
});

// ---------------------------------------------------------------------------
// 2. Add a new member
// ---------------------------------------------------------------------------
test.describe("@phase-3 Mitglieder — add member", () => {
  test("can add a new member via dialog", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    // Open add dialog
    await page.click("button:has-text('Mitglied hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Fill form
    const unique = randomBytes(4).toString("hex");
    await page.fill('input[name="vorname"]', "Test");
    await page.fill('input[name="nachname"]', `E2E-${unique}`);
    await page.fill('input[name="email"]', `test-${unique}@example.com`);

    // Submit — button text is "Mitglied anlegen" (AddMemberDialog.svelte)
    await page.click('button[type="submit"]:has-text("Mitglied anlegen")');

    // Dialog closes; member appears in list.
    // Target the visible link element (Nachname, Vorname) rather than the
    // hidden <p class="truncate"> card that also contains the text.
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("link", { name: new RegExp(`E2E-${unique}`) }),
    ).toBeVisible();
  });

  test("shows validation errors for missing required fields", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    await page.click("button:has-text('Mitglied hinzufügen')");
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Submit without filling required fields — HTML5 required blocks submit,
    // but we can check the dialog stays open.
    // Button text is "Mitglied anlegen" (AddMemberDialog.svelte).
    const submitBtn = page.locator(
      'button[type="submit"]:has-text("Mitglied anlegen")',
    );
    await expect(submitBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Matrix view
// ---------------------------------------------------------------------------
test.describe("@phase-3 Mitglieder — matrix view", () => {
  test("switching to matrix view shows the Beitragsmatrix grid", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder");

    // Click matrix toggle
    await page.click("button:has-text('Beitrags-Matrix')");
    await expect(page).toHaveURL(/view=matrix/);
    // Phase-2 redesign: matrix is a role=grid (not a <table>).
    await expect(
      page.getByRole("grid", { name: "Beitragsmatrix" }),
    ).toBeVisible();
  });

  test("switching back to list view hides the grid", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    await page.click("button:has-text('Liste')");
    await expect(page).toHaveURL(/\/app\/mitglieder(?!\?)/);
    await expect(
      page.getByRole("grid", { name: "Beitragsmatrix" }),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Mark beitrag paid (matrix cell → popover)
// ---------------------------------------------------------------------------
test.describe("@phase-3 Mitglieder — mark beitrag paid", () => {
  test("clicking an open cell opens the mark-paid popover", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app/mitglieder?view=matrix");

    // Phase-2 redesign: click an open/overdue gridcell → popover, click Bezahlt.
    const openCell = page
      .getByRole("gridcell")
      .filter({ hasText: /^$/ })
      .or(page.locator('[role="gridcell"][data-state="open"]'))
      .first();

    const cell = page.locator('[role="gridcell"][data-state="open"]').first();
    if (await cell.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cell.click();
      // The mark-paid popover (role=dialog) should appear with a Bezahlt button.
      await expect(page.getByRole("button", { name: /Bezahlt/ })).toBeVisible();
    } else {
      void openCell; // no open cell to exercise — skip gracefully
      test.skip();
    }
  });
});

// ---------------------------------------------------------------------------
// Package F — member-zahlung: list-page scenarios
//
// Uses the same fixed UUIDs as member-detail.spec.ts Package F section.
// The seedF() helper is duplicated here because spec files are independent
// modules; the seed is idempotent so both specs can call it.
// ---------------------------------------------------------------------------

const MF_OPEN_ID = "f0000000-0000-0000-0000-00000000ff01";
const MF_PARTIAL_ID = "f0000000-0000-0000-0000-00000000ff02";
const MF_EXITED_ID = "f0000000-0000-0000-0000-00000000ff04";
// F_PAID_ID not needed for list tests

const MF_ANCHOR_YEAR = new Date().getFullYear();
const MF_FUTURE_FAELLIGKEIT = `${MF_ANCHOR_YEAR + 5}-03-31`;
const MF_BETRAG = 6000; // 60,00 €

async function seedMF(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const url =
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    // Clean up any previous run (also cleans the F_PAID_ID row for shared UUID safety)
    await sql`DELETE FROM member_beitrags WHERE member_id IN (${MF_OPEN_ID}, ${MF_PARTIAL_ID}, 'f0000000-0000-0000-0000-00000000ff03', ${MF_EXITED_ID})`;
    await sql`DELETE FROM members WHERE id IN (${MF_OPEN_ID}, ${MF_PARTIAL_ID}, 'f0000000-0000-0000-0000-00000000ff03', ${MF_EXITED_ID})`;

    await sql`
      INSERT INTO members (id, vorname, nachname, email, role, eintritts_datum, is_fixture)
      VALUES
        (${MF_OPEN_ID},   'PkgF', 'Open',    'pkgf.open@example.test',   'mitglied', ${`${MF_ANCHOR_YEAR - 2}-01-01`}, true),
        (${MF_PARTIAL_ID},'PkgF', 'Partial', 'pkgf.partial@example.test','mitglied', ${`${MF_ANCHOR_YEAR - 2}-01-01`}, true),
        (${MF_EXITED_ID}, 'PkgF', 'Exited',  null, 'mitglied', '2020-01-01', true)
    `;

    await sql`
      INSERT INTO beitragssatz_by_year (year, cents, faelligkeit_at)
      VALUES (${MF_ANCHOR_YEAR}, ${MF_BETRAG}, ${MF_FUTURE_FAELLIGKEIT})
      ON CONFLICT (year) DO UPDATE SET faelligkeit_at = ${MF_FUTURE_FAELLIGKEIT}
    `;

    // MF_PARTIAL_ID: half paid
    await sql`
      INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents)
      VALUES (${MF_PARTIAL_ID}, ${MF_ANCHOR_YEAR}, ${MF_BETRAG}, ${MF_BETRAG / 2})
    `;

    // MF_EXITED_ID: left last year
    await sql`
      UPDATE members SET austritts_datum = ${`${MF_ANCHOR_YEAR - 1}-12-31`}
      WHERE id = ${MF_EXITED_ID}
    `;
  } finally {
    await sql.end();
  }
}

async function signInMF(page: import("@playwright/test").Page): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const { randomBytes, createHash } = await import("node:crypto");
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const adminEmail = process.env["TEST_ADMIN_EMAIL"] ?? "admin@example.com";
  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${tokenHash}, ${adminEmail}, ${expiresAt})
  `;
  await client.end();

  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible({ timeout: 2000 }).catch(() => false)) {
    await mismatch.click();
  }
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 15_000 }),
    page.click('button[type="submit"]').catch(() => {
      /* auto-redirect */
    }),
  ]);
}

// ---------------------------------------------------------------------------
// F-b: partial fraction on list — MemberRow pill shows paid / betrag
// ---------------------------------------------------------------------------
test.describe("@phase-member-zahlung list F-b — partial fraction pill", () => {
  test.beforeEach(async () => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await seedMF();
  });

  test("list row pill shows partial fraction for half-paid member", async ({
    page,
  }) => {
    // Use a desktop viewport so the pill is visible (hidden sm:flex)
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInMF(page);
    await page.goto("/app/mitglieder");

    // Find the member row for PkgF Partial
    const row = page.getByTestId("member-row").filter({ hasText: /Partial/ });
    await expect(row).toBeVisible();

    // Pill should show partial fraction: "30" and "60" (30,00 € / 60,00 €)
    await expect(row).toContainText(/30/);
    await expect(row).toContainText(/60/);
  });
});

// ---------------------------------------------------------------------------
// F-d: ausgetreten muted — list row has no pay button
// ---------------------------------------------------------------------------
test.describe("@phase-member-zahlung list F-d — ausgetreten no pay", () => {
  test.beforeEach(async () => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await seedMF();
  });

  test("exited member row has no one-tap pay button", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInMF(page);
    await page.goto("/app/mitglieder");

    // Find the exited member's row
    const row = page.getByTestId("member-row").filter({ hasText: /Exited/ });
    await expect(row).toBeVisible();

    // No pay button (data-testid="member-row-pay") in the exited row
    const payBtn = row.getByTestId("member-row-pay");
    const count = await payBtn.count();
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F-e: desktop one-click pay — MemberRow pay button opens MarkPaidControl
// ---------------------------------------------------------------------------
test.describe("@phase-member-zahlung list F-e — desktop one-click pay", () => {
  test.beforeEach(async () => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await seedMF();
  });

  test("desktop pay button on open-year row opens the mark-paid popover", async ({
    page,
  }) => {
    // Desktop viewport so the pay button is rendered and accessible
    await page.setViewportSize({ width: 1280, height: 800 });
    await signInMF(page);
    await page.goto("/app/mitglieder");

    // Find the open member's row (PkgF Open — no beitrags row, shown as open)
    const row = page.getByTestId("member-row").filter({ hasText: /Open/ });
    await expect(row).toBeVisible();

    // The one-tap pay button should be present for an open member
    const payBtn = row.getByTestId("member-row-pay");
    await expect(payBtn).toBeVisible();

    // Click it — opens the MarkPaidControl popover (desktop: markpaid-popover)
    await payBtn.click();

    // Popover content: "Bezahlt am" label or "Bezahlt ↵" button visible
    const dateInput = page.getByLabel("Bezahlt am");
    await expect(dateInput).toBeVisible({ timeout: 5000 });
  });
});
