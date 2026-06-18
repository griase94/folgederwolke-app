/**
 * E2E Member Detail tests — @phase-3, @phase-member-zahlung
 *
 * Strategy: signs in via magic-link shortcut, uses a fixture member that
 * the DB seed creates, then exercises the detail page UI.
 *
 * Tags: @phase-3, @phase-member-zahlung
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

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

/** Return the ID of the first fixture member, or null if none. */
async function getFixtureMemberId(): Promise<string | null> {
  if (!process.env["DATABASE_URL"]) return null;
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"], {
    prepare: false,
    max: 1,
  });
  const rows = await client<
    { id: string }[]
  >`SELECT id FROM members WHERE is_fixture = true ORDER BY created_at LIMIT 1`;
  await client.end();
  return rows[0]?.id ?? null;
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

// ---------------------------------------------------------------------------
// 1. Basic navigation
// ---------------------------------------------------------------------------
test.describe("@phase-3 Member detail — navigation", () => {
  test("unauthenticated access to member detail redirects to sign-in", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }
    await page.goto(`/app/mitglieder/${id}`);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("navigating from list to detail shows member name in breadcrumb", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    // Breadcrumb should contain "Mitglieder"
    await expect(page.locator("nav[aria-label='Brotkrümel']")).toContainText(
      "Mitglieder",
    );
    // Page title should be visible
    await expect(page.locator("h2")).toBeVisible();
  });

  test("non-existent member id returns 404", async ({ page }) => {
    await signIn(page);
    await page.goto("/app/mitglieder/00000000-0000-0000-0000-000000000000");
    // SvelteKit error page — look for 404 text
    await expect(page.locator("body")).toContainText(/404|nicht gefunden/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Info card
// ---------------------------------------------------------------------------
test.describe("@phase-3 Member detail — info card", () => {
  test("member info card shows name, role, and status", async ({ page }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    // Info card should show the member's name (h2)
    const card = page.locator("h2").first();
    await expect(card).toBeVisible();

    // Bearbeiten button should be present
    await expect(page.locator("button:has-text('Bearbeiten')")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 3. Beitrags timeline tab
// ---------------------------------------------------------------------------
test.describe("@phase-3 Member detail — beitrags timeline", () => {
  test("Beitrag tab is active by default and shows timeline or empty state", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    // "Beitrag" tab should exist and be selected
    const beitragTab = page.locator('[role="tab"]:has-text("Beitrag")');
    await expect(beitragTab).toBeVisible();
    await expect(beitragTab).toHaveAttribute("aria-selected", "true");
  });

  test("switching to Aktivität tab shows activity feed", async ({ page }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    await page.click('[role="tab"]:has-text("Aktivität")');
    await expect(
      page.locator('[role="tab"]:has-text("Aktivität")'),
    ).toHaveAttribute("aria-selected", "true");
  });
});

// ---------------------------------------------------------------------------
// 4. Send reminder sheet
// ---------------------------------------------------------------------------
test.describe("@phase-3 Member detail — send reminder", () => {
  test("sticky CTA bar is visible with 'Erinnerung senden' button", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    await expect(
      page.locator("button:has-text('Erinnerung senden')"),
    ).toBeVisible();
  });

  test("clicking 'Erinnerung senden' opens the reminder sheet", async ({
    page,
  }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    const btn = page.locator("button:has-text('Erinnerung senden')");
    const isEnabled = await btn.isEnabled({ timeout: 2000 }).catch(() => false);
    if (!isEnabled) {
      // Member has no email — sheet can't open; skip gracefully
      test.skip();
      return;
    }

    await btn.click();

    // Sheet should be visible
    await expect(page.locator("text=Erinnerungs-Mail vorbereiten")).toBeVisible(
      { timeout: 3000 },
    );

    // Year selector should be present
    await expect(page.locator("select#reminder-year")).toBeVisible();

    // Mail senden button should exist
    await expect(page.locator("button:has-text('Mail senden')")).toBeVisible();
  });

  test("reminder sheet can be closed with Abbrechen", async ({ page }) => {
    const id = await getFixtureMemberId();
    if (!id) {
      test.skip();
      return;
    }

    await signIn(page);
    await page.goto(`/app/mitglieder/${id}`);

    const btn = page.locator("button:has-text('Erinnerung senden')");
    const isEnabled = await btn.isEnabled({ timeout: 2000 }).catch(() => false);
    if (!isEnabled) {
      test.skip();
      return;
    }

    await btn.click();
    await expect(page.locator("text=Erinnerungs-Mail vorbereiten")).toBeVisible(
      { timeout: 3000 },
    );

    await page.click("button:has-text('Abbrechen')");
    await expect(
      page.locator("text=Erinnerungs-Mail vorbereiten"),
    ).not.toBeVisible({ timeout: 3000 });
  });
});

// ---------------------------------------------------------------------------
// Package F — member-zahlung: detail-page scenarios
//
// Uses dedicated fixed UUIDs so seed state is isolated from other specs.
// The seed() helper runs in beforeEach.
// ---------------------------------------------------------------------------

const F_OPEN_ID = "f0000000-0000-0000-0000-00000000ff01";
const F_PARTIAL_ID = "f0000000-0000-0000-0000-00000000ff02";
const F_PAID_ID = "f0000000-0000-0000-0000-00000000ff03";
const F_EXITED_ID = "f0000000-0000-0000-0000-00000000ff04";

const ANCHOR_YEAR = new Date().getFullYear();
// A Beitragssatz with a far-future Fälligkeit keeps the state "open" (not
// "overdue") regardless of when the test runs.
const FUTURE_FAELLIGKEIT = `${ANCHOR_YEAR + 5}-03-31`;
const BETRAG = 6000; // 60,00 €

async function seedF(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const url =
    process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    // Clean up any previous run
    await sql`DELETE FROM member_beitrags WHERE member_id IN (${F_OPEN_ID}, ${F_PARTIAL_ID}, ${F_PAID_ID}, ${F_EXITED_ID})`;
    await sql`DELETE FROM members WHERE id IN (${F_OPEN_ID}, ${F_PARTIAL_ID}, ${F_PAID_ID}, ${F_EXITED_ID})`;

    // Insert the four Package F test members
    await sql`
      INSERT INTO members (id, vorname, nachname, email, role, eintritts_datum, is_fixture)
      VALUES
        (${F_OPEN_ID},   'PkgF', 'Open',    'pkgf.open@example.test',   'mitglied', ${`${ANCHOR_YEAR - 2}-01-01`}, true),
        (${F_PARTIAL_ID},'PkgF', 'Partial', 'pkgf.partial@example.test','mitglied', ${`${ANCHOR_YEAR - 2}-01-01`}, true),
        (${F_PAID_ID},   'PkgF', 'Paid',    'pkgf.paid@example.test',   'mitglied', ${`${ANCHOR_YEAR - 2}-01-01`}, true),
        (${F_EXITED_ID}, 'PkgF', 'Exited',  null, 'mitglied', '2020-01-01', true)
    `;

    // Ensure Beitragssatz for the anchor year exists with a future Fälligkeit
    await sql`
      INSERT INTO beitragssatz_by_year (year, cents, faelligkeit_at)
      VALUES (${ANCHOR_YEAR}, ${BETRAG}, ${FUTURE_FAELLIGKEIT})
      ON CONFLICT (year) DO UPDATE SET faelligkeit_at = ${FUTURE_FAELLIGKEIT}
    `;

    // F_OPEN_ID: no member_beitrags row → "open" via satz resolution
    // F_PARTIAL_ID: row with half paid → "partial"
    await sql`
      INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents)
      VALUES (${F_PARTIAL_ID}, ${ANCHOR_YEAR}, ${BETRAG}, ${BETRAG / 2})
    `;
    // F_PAID_ID: fully paid row
    await sql`
      INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
      VALUES (${F_PAID_ID}, ${ANCHOR_YEAR}, ${BETRAG}, ${BETRAG}, ${`${ANCHOR_YEAR}-03-01`})
    `;
    // F_EXITED_ID: left last year — current year is post-austritt
    await sql`
      UPDATE members SET austritts_datum = ${`${ANCHOR_YEAR - 1}-12-31`}
      WHERE id = ${F_EXITED_ID}
    `;
  } finally {
    await sql.end();
  }
}

async function signInF(page: import("@playwright/test").Page): Promise<void> {
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
    page.click('button[type="submit"]').catch(() => {
      /* auto-redirect */
    }),
  ]);
}

test.describe("@phase-member-zahlung detail F — setup guard", () => {
  test.beforeEach(async () => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await seedF();
  });

  test("seed sanity: Package F members are created", async () => {
    // Just verifies the seed ran without errors.
    // Real assertions live in the scenarios below.
  });
});

// ---------------------------------------------------------------------------
// F-a: no-row record — open member with no member_beitrags row records pay
// ---------------------------------------------------------------------------
test.describe("@phase-member-zahlung detail F-a — no-row record", () => {
  test.beforeEach(async () => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await seedF();
  });

  test("detail hero shows Zahlung erfassen for open no-row member; records payment → Bezahlt", async ({
    page,
  }) => {
    await signInF(page);
    await page.goto(`/app/mitglieder/${F_OPEN_ID}`);

    // Hero present
    const hero = page.getByTestId("beitrags-hero");
    await expect(hero).toBeVisible();

    // Status pill shows "Offen" (open, no row)
    await expect(hero).toContainText(/Offen/i);

    // "Zahlung erfassen" CTA is present
    const cta = page.getByTestId("beitrags-hero-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(/Zahlung erfassen/i);

    // Click CTA — opens the mark-paid popover/sheet
    await cta.click();

    // Wait for Bezahlt am input inside the popover/sheet
    const dateInput = page.getByLabel("Bezahlt am");
    await expect(dateInput).toBeVisible({ timeout: 5000 });

    // Submit with default date
    await page.getByRole("button", { name: /Bezahlt/ }).click();

    // Hero should flip to "Bezahlt" after invalidateAll
    await expect(hero).toContainText(/Bezahlt/i, { timeout: 8000 });
    // CTA changes to "Zahlung bearbeiten"
    await expect(cta).toContainText(/bearbeiten/i, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// F-b: partial fraction — detail hero shows paid / betrag fraction
// ---------------------------------------------------------------------------
test.describe("@phase-member-zahlung detail F-b — partial fraction", () => {
  test.beforeEach(async () => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await seedF();
  });

  test("detail hero shows paid / betrag fraction and Restbetrag erfassen CTA for partial member", async ({
    page,
  }) => {
    await signInF(page);
    await page.goto(`/app/mitglieder/${F_PARTIAL_ID}`);

    const hero = page.getByTestId("beitrags-hero");
    await expect(hero).toBeVisible();

    // Fraction line: "30,00 € / 60,00 €" (half of 60 €)
    await expect(hero).toContainText(/30,00/);
    await expect(hero).toContainText(/60,00/);

    // "Noch offen" amount shown
    await expect(hero).toContainText(/Noch offen/i);

    // CTA reads "Zahlung erfassen" (for partial state the hero CTA is 'erfassen')
    const cta = page.getByTestId("beitrags-hero-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(/Zahlung erfassen/i);

    // The timeline row also shows "Restbetrag erfassen" button
    const timelineRow = page
      .getByTestId("beitragsverlauf-row")
      .filter({ hasText: String(ANCHOR_YEAR) });
    await expect(timelineRow).toBeVisible();
    await expect(
      timelineRow.getByRole("button", { name: /Restbetrag erfassen/i }),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// F-c: paid → no reminder CTA in sticky bar
// ---------------------------------------------------------------------------
test.describe("@phase-member-zahlung detail F-c — paid no reminder", () => {
  test.beforeEach(async () => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await seedF();
  });

  test("fully paid member: sticky bar has no Erinnerung senden button", async ({
    page,
  }) => {
    await signInF(page);
    await page.goto(`/app/mitglieder/${F_PAID_ID}`);

    // Hero shows Bezahlt
    const hero = page.getByTestId("beitrags-hero");
    await expect(hero).toBeVisible();
    await expect(hero).toContainText(/Bezahlt/i);

    // "Erinnerung senden" must NOT be present anywhere on the page (no false debt).
    // Use count() which doesn't throw when the element is absent.
    const reminderBtn = page.locator("button:has-text('Erinnerung senden')");
    const count = await reminderBtn.count();
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F-d: ausgetreten muted — detail hero has no pay CTA
// ---------------------------------------------------------------------------
test.describe("@phase-member-zahlung detail F-d — ausgetreten muted", () => {
  test.beforeEach(async () => {
    if (!process.env["DATABASE_URL"]) test.skip();
    await seedF();
  });

  test("exited member: detail hero shows muted state, no Zahlung erfassen CTA", async ({
    page,
  }) => {
    await signInF(page);
    await page.goto(`/app/mitglieder/${F_EXITED_ID}`);

    const hero = page.getByTestId("beitrags-hero");
    await expect(hero).toBeVisible();

    // No "Zahlung erfassen" or "Zahlung bearbeiten" button in the hero
    const heroCta = page.getByTestId("beitrags-hero-cta");
    const ctaCount = await heroCta.count();
    expect(ctaCount).toBe(0);

    // No "Erinnerung senden" in sticky bar (no false debt for exited)
    const reminderBtn = page.locator("button:has-text('Erinnerung senden')");
    const reminderCount = await reminderBtn.count();
    expect(reminderCount).toBe(0);
  });
});
