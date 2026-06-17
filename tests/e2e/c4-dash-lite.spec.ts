/**
 * E2E C4-DASH-lite — KPI hero + WGB chip + Beitragsübersicht + session label.
 *
 * Done-tests for cluster C4-DASH-lite (Night 1, Wave 1). Five guarantees:
 *   1. KPI hero value carries the `text-4xl` class (so the bounding-box >=
 *      36px check that already passes for text-3xl can't mask a regression).
 *   2. WGB widget renders `[data-component="wgb-chip"]` when status === 'ok'
 *      and *not* `[data-component="wgb-card"]` (and vice-versa).
 *   3. BeitragsuebersichtWidget shows LITERAL "60,00 €" paid for a deterministic
 *      seed scenario (1 paid €60, 1 owes €60). Catches arithmetic regressions
 *      a "is visible" check can't.
 *   4. Clicking the widget navigates to /app/mitglieder.
 *   5. Activity feed labels session entities as "Sitzung" (fixes O-1).
 *
 * Auth pattern mirrors tests/e2e/b1-invoice-effect-loop.spec.ts (magic-link
 * row insert + GET /sign-in/verify).
 *
 * @phase-9
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash, randomUUID } from "node:crypto";

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

/**
 * Seed a deterministic Beitragsübersicht scenario for the current Berlin year:
 *   - 1 fixture member with paid_cents=6000, betrag_cents=6000, gezahlt_am set
 *     → "1 von N bezahlt"; paid_cents sum = 6000
 *   - 1 fixture member with paid_cents=0, betrag_cents=6000, gezahlt_am NULL
 *     → "open_cents" sum = 6000
 *
 * Uses ON CONFLICT DO UPDATE on member_beitrags_member_year_uq so re-running
 * the e2e suite is idempotent. Returns the canonical year so the test can
 * assert the heading.
 */
async function seedBeitragsScenario(): Promise<{ year: number }> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  // Wipe any leftover beitrag rows for the current year so the widget reflects
  // only this scenario. Members themselves are preserved.
  const yearRow = await client<{ year: number }[]>`
    SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Berlin'))::int AS year
  `;
  const year = yearRow[0]!.year;

  await client`DELETE FROM member_beitrags WHERE year = ${year}`;

  // Pick the two oldest fixture members (deterministic ordering by created_at).
  const members = await client<{ id: string }[]>`
    SELECT id FROM members
    WHERE is_fixture = true AND austritts_datum IS NULL
    ORDER BY created_at ASC
    LIMIT 2
  `;
  if (members.length < 2) {
    throw new Error(
      `Expected >= 2 fixture members for C4-DASH-lite seed, got ${members.length}`,
    );
  }

  const [paid, open] = members;

  await client`
    INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
    VALUES (${paid!.id}, ${year}, 6000, 6000, ${`${year}-01-15`})
  `;
  await client`
    INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents, gezahlt_am)
    VALUES (${open!.id}, ${year}, 6000, 0, NULL)
  `;

  await client.end();
  return { year };
}

/**
 * Seed an audit_log row tagged `entity_kind = 'session'` so the activity feed
 * can render a "Sitzung … angemeldet" line. Idempotent via DELETE-then-INSERT
 * on a marker payload key. The hash-chain trigger fills chain_seq + row_hash
 * automatically (Phase 7.5).
 */
async function seedSessionAuditRow(): Promise<void> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });

  const businessId = `C4-DASH-LITE-${randomUUID()}`;
  await client`
    INSERT INTO audit_log (
      action, entity_kind, entity_business_id, actor_kind, payload
    )
    VALUES (
      'sign_in', 'session', ${businessId}, 'user', ${JSON.stringify({ c4_dash_lite_seed: true })}::jsonb
    )
  `;
  await client.end();
}

test.beforeEach(async () => {
  if (!process.env["DATABASE_URL"]) {
    test.skip();
  }
});

test.describe("@phase-9 C4-DASH-lite dashboard upgrades", () => {
  test("KPI hero value has text-4xl class applied", async ({ page }) => {
    // Per spec redteam: bounding-box >= 36px check passes for text-3xl
    // (line-height already ~30-36px). Assert the actual Tailwind class is
    // applied so we catch a regression where the size attribute was dropped.
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto("/app");
    const hero = page.getByTestId("kpi-hero-value").first();
    await expect(hero).toBeVisible();
    await expect(hero).toHaveClass(/text-4xl/);
  });

  test("WGB renders chip when status=ok and not the full card", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/app");
    // Default test seed has no wirtschaftlich-sphere Einnahmen so WGB
    // status === 'ok'.
    await expect(page.locator('[data-component="wgb-chip"]')).toBeVisible();
    await expect(page.locator('[data-component="wgb-card"]')).toHaveCount(0);
  });

  test("BeitragsuebersichtWidget shows literal '60,00 €' paid + open for seeded scenario", async ({
    page,
  }) => {
    await signIn(page);
    await seedBeitragsScenario();
    await page.goto("/app");

    const widget = page.getByTestId("beitragsuebersicht-widget");
    await expect(widget).toBeVisible();

    // German EUR locale uses comma decimal + non-breaking space before €.
    // toHaveText normalizes whitespace so the literal regex tolerates it.
    await expect(page.getByTestId("beitragsuebersicht-paid")).toHaveText(
      /^60,00\s*€$/,
    );
    await expect(page.getByTestId("beitragsuebersicht-paid-count")).toHaveText(
      "1",
    );
    await expect(page.getByTestId("beitragsuebersicht-open")).toHaveText(
      /^60,00\s*€$/,
    );
  });

  test("widget click navigates to /app/mitglieder", async ({ page }) => {
    await signIn(page);
    await page.goto("/app");
    await page.getByTestId("beitragsuebersicht-widget").click();
    await expect(page).toHaveURL(/\/app\/mitglieder/);
  });

  test("activity feed renders 'Sitzung' for session entities", async ({
    page,
  }) => {
    // Seed a session audit row before navigating. The bug being fixed is
    // exactly "session activity not labeled 'Sitzung'" — a skip-on-empty
    // would silently pass the regression we're protecting against.
    await signIn(page);
    await seedSessionAuditRow();
    await page.goto("/app");
    const sessionRow = page.locator("text=/Sitzung/").first();
    await expect(sessionRow).toBeVisible();
  });

  test("stays light under OS dark mode (Aurora is light-only at launch)", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await signIn(page);
    await page.goto("/app");
    const widget = page.getByTestId("beitragsuebersicht-widget");
    await expect(widget).toBeVisible();
    // Aurora ships LIGHT-ONLY at launch (spec §2/§3): aurora.css sets
    // `color-scheme: light only` and the dark variant stays class-based with no
    // `.dark` class ever applied, so the app must NOT auto-darken under the OS
    // dark preference. Dark ships later as a switchable theme via the registry,
    // not via prefers-color-scheme. This guards that decision.
    const htmlClass = await page.evaluate(
      () => document.documentElement.className,
    );
    expect(htmlClass).not.toContain("dark");
  });
});
