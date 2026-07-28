/**
 * E2E — member self-service portal auth + route gating (Aurora A-flow S2a).
 *
 * Strategy mirrors auth.spec.ts: bypass issueMagicLink by inserting a
 * magic_link row directly, then drive the verify → session flow and assert the
 * ROLE-AWARE routing (the HTTP-level counterpart to the DB-backed member-auth
 * integration tests). Uses seeded fixture members (anna.mueller@example.de) and
 * the .env.test admin (admin@example.com, NOT a member).
 *
 * @phase-2
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Insert a magic_link row directly; returns the raw token for the verify URL. */
async function insertMagicLink(emailCanonical: string): Promise<string> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const rawToken = randomBytes(32).toString("base64url");
  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${sha256(rawToken)}, ${emailCanonical}, ${new Date(Date.now() + 15 * 60_000)})
  `;
  await client.end();
  return rawToken;
}

/** Complete the click-through verify POST for a freshly-inserted token. */
async function verify(page: import("@playwright/test").Page, rawToken: string) {
  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatchBtn = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatchBtn.isVisible().catch(() => false)) {
    await mismatchBtn.click();
  }
  await page.click('button[type="submit"]');
}

/** Seed one Auslage-submission for the member with `email`; returns member_id.
 *  High-seq AUS-2099-9xxxx business_ids so they never collide with allocated
 *  ids and are trivially cleaned up. */
async function seedSubmissionFor(
  email: string,
  businessId: string,
  bezeichnung: string,
): Promise<string> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const rows =
    await client`SELECT id FROM members WHERE email = ${email} LIMIT 1`;
  const memberId = rows[0]?.["id"] as string;
  await client`
    INSERT INTO auslagen_submissions
      (business_id, bezeichnung, betrag_cents, rechnungsdatum, bezahlt_von_kind,
       bezahlt_von_member_id, bezahlt_von_display, beleg_verzicht_grund,
       consent_text_version)
    VALUES
      (${businessId}, ${bezeichnung}, 1500, '2026-07-01', 'member', ${memberId},
       ${"Mitglied: " + bezeichnung}, 'E2E-Fixture ohne Beleg', 'e2e')
  `;
  await client.end();
  return memberId;
}

async function cleanupSeededSubmissions() {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  await client`DELETE FROM auslagen_submissions WHERE business_id LIKE 'AUS-2099-9%'`;
  await client.end();
}

test.describe("@phase-2 Portal — member auth + route gating", () => {
  // Spec-isolation (S1 lesson): remove the submissions this spec seeds so the
  // admin inbox / other specs never see stray rows.
  test.afterAll(async () => {
    if (process.env["DATABASE_URL"]) await cleanupSeededSubmissions();
  });

  test("unauthenticated /portal redirects to /sign-in", async ({ page }) => {
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("member magic-link lands on /portal and is bounced off /app", async ({
    page,
  }) => {
    if (!process.env["DATABASE_URL"]) {
      test.skip();
      return;
    }
    const rawToken = await insertMagicLink("anna.mueller@example.de");

    await Promise.all([page.waitForURL(/\/portal/), verify(page, rawToken)]);
    await expect(page).toHaveURL(/\/portal/);
    // The gated member home renders the personalised greeting from the session.
    await expect(page.getByTestId("portal-greeting")).toContainText(
      "Servus, Anna",
    );

    // A self-service member never gets the admin app — /app bounces to /portal.
    await Promise.all([page.waitForURL(/\/portal/), page.goto("/app")]);
    await expect(page).toHaveURL(/\/portal/);
  });

  test("admin magic-link lands on /app and is bounced off /portal", async ({
    page,
  }) => {
    if (!process.env["DATABASE_URL"]) {
      test.skip();
      return;
    }
    const rawToken = await insertMagicLink("admin@example.com");

    await Promise.all([page.waitForURL(/\/app/), verify(page, rawToken)]);
    await expect(page).toHaveURL(/\/app/);

    // Admin without a linked Mitglied has no portal identity → /portal → /app.
    await Promise.all([page.waitForURL(/\/app/), page.goto("/portal")]);
    await expect(page).toHaveURL(/\/app/);
  });

  test("portal list is strictly session-scoped — foreign Auslage never visible, client member_id ignored", async ({
    page,
  }) => {
    if (!process.env["DATABASE_URL"]) {
      test.skip();
      return;
    }
    const ANNA_AUS = "AUS-2099-95001";
    const FELIX_AUS = "AUS-2099-95002";
    await seedSubmissionFor("anna.mueller@example.de", ANNA_AUS, "Annas Beleg");
    const felixId = await seedSubmissionFor(
      "felix.bauer@example.de",
      FELIX_AUS,
      "Felix Beleg",
    );

    const rawToken = await insertMagicLink("anna.mueller@example.de");
    await Promise.all([page.waitForURL(/\/portal/), verify(page, rawToken)]);

    // Anna sees her OWN submission; Felix's is never in her list.
    await expect(page.getByText(ANNA_AUS)).toBeVisible();
    await expect(page.getByText(FELIX_AUS)).toHaveCount(0);

    // A client-supplied member_id in the query string is IGNORED — the scope
    // filter reads ONLY the session member, so Felix's row still never appears.
    await page.goto(`/portal?memberId=${felixId}`);
    await expect(page.getByText(ANNA_AUS)).toBeVisible();
    await expect(page.getByText(FELIX_AUS)).toHaveCount(0);
  });
});
