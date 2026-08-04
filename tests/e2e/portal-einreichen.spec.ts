/**
 * E2E — member Auslage submit through the REAL UI (Aurora A-flow S2b).
 *
 * This spec exists because of a specific hole: the unit tests built the submit
 * payload by hand and the render judge only looked at pixels, so the stretch
 * BETWEEN them — does what the user types actually reach the server? — was
 * never covered. It did not: the typed IBAN (Fall B/C) was dropped by the
 * enhance handler, which rebuilds the whole multipart body. Fall B dead-ended
 * on a 422 that contradicted the user's own input, and Fall C silently
 * snapshotted the WRONG payout account.
 *
 * So every assertion here goes through the rendered form: type into the real
 * inputs, press the real button, then read what was COMMITTED.
 *
 * Members are spec-local (`portal-einreichen-e2e-*`) — the shared seed members
 * are mutated by a dozen other specs.
 *
 * @phase-2
 */

import { expect, test, type Page } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

const PREFIX = "portal-einreichen-e2e";
const TYPED_IBAN = "DE12 5001 0517 0648 4898 90";
const TYPED_NORMALIZED = "DE12500105170648489890";
const STORED_IBAN = "DE89370400440532013000";

function sha256(v: string): string {
  return createHash("sha256").update(v, "utf8").digest("hex");
}

async function sql() {
  const { default: postgres } = await import("postgres");
  return postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
}

/** A member this spec owns. `iban=null` → Fall B, otherwise Fall A/C. */
async function seedMember(tag: string, iban: string | null): Promise<string> {
  const client = await sql();
  const email = `${PREFIX}-${tag}@portal.test`;
  const existing = await client`SELECT id FROM members WHERE email = ${email}`;
  if (existing.length === 0) {
    await client`
      INSERT INTO members (vorname, nachname, email, eintritts_datum, iban, is_fixture)
      VALUES (${tag}, 'Portalson', ${email}, '2020-01-01', ${iban}, true)`;
  } else {
    // Reset the IBAN so a re-run starts from the intended case.
    await client`UPDATE members SET iban = ${iban} WHERE email = ${email}`;
  }
  await client.end();
  return email;
}

async function signIn(page: Page, email: string) {
  const client = await sql();
  const rawToken = randomBytes(32).toString("base64url");
  await client`
    INSERT INTO magic_links (token_hash, email_canonical, expires_at)
    VALUES (${sha256(rawToken)}, ${email}, ${new Date(Date.now() + 15 * 60_000)})`;
  await client.end();

  await page.goto(`/sign-in/verify?token=${rawToken}`);
  const mismatch = page.locator("text=Ja, trotzdem fortfahren");
  if (await mismatch.isVisible().catch(() => false)) await mismatch.click();
  await Promise.all([
    page.waitForURL(/\/portal/),
    page.click('button[type="submit"]'),
  ]);
}

/** Read what was actually committed for a member's newest submission. */
async function newestSubmission(email: string) {
  const client = await sql();
  const rows = await client`
    SELECT s.business_id, s.erstattung_iban, s.betrag_cents, m.iban AS member_iban
    FROM auslagen_submissions s
    JOIN members m ON m.id = s.bezahlt_von_member_id
    WHERE m.email = ${email}
    ORDER BY s.submitted_at DESC
    LIMIT 1`;
  await client.end();
  return rows[0];
}

/** Fill the one Auslage block via the real fields. */
async function fillBlock(page: Page) {
  await page
    .getByPlaceholder("z. B. Getränke fürs Sommerfest")
    .fill("E2E Transport-Test");
  await page.getByTestId("amount-field-input").fill("24,90");
  const date = page.getByTestId("date-field-input");
  await date.fill("01.07.2026");
  await date.blur();
  // Verzicht arm — keeps the spec free of file-upload plumbing.
  await page.getByTestId("beleg-kein-beleg").check();
  await page
    .getByTestId("beleg-verzicht-grund")
    .fill("E2E: Bon ist im Regen zerlaufen.");
}

async function cleanup() {
  const client = await sql();
  await client`
    DELETE FROM auslagen_submissions WHERE bezahlt_von_member_id IN (
      SELECT id FROM members WHERE email LIKE ${PREFIX + "%"})`;
  await client`
    DELETE FROM sessions WHERE user_id IN (
      SELECT id FROM users WHERE email LIKE ${PREFIX + "%"})`;
  await client`DELETE FROM magic_links WHERE email_canonical LIKE ${PREFIX + "%"}`;
  // users/members stay — audit_log references them and is append-only (ADR-0004).
  await client.end();
}

test.describe("@phase-2 Portal — Einreichen transportiert die Eingabe", () => {
  test.skip(!process.env["DATABASE_URL"], "needs DATABASE_URL");

  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("Fall B: typed IBAN reaches the server and updates the profile", async ({
    page,
  }) => {
    const email = await seedMember("fallb", null);
    await signIn(page, email);
    await page.goto("/portal/auslagen/neu");

    // Fall B: no stored IBAN → the field is right there, save-to-profile on.
    const ibanInput = page.getByTestId("payout-iban-input");
    await expect(ibanInput).toBeVisible();
    await expect(page.getByTestId("payout-save-to-profile")).toBeChecked();
    await ibanInput.fill(TYPED_IBAN);
    await fillBlock(page);

    await page.getByTestId("auslage-submit").click();
    // In-shell handoff, not a redirect.
    await expect(page.getByTestId("submit-handoff")).toBeVisible({
      timeout: 15_000,
    });

    const row = await newestSubmission(email);
    // THE point of this spec: the typed IBAN is what got snapshotted.
    expect(row?.["erstattung_iban"]).toBe(TYPED_NORMALIZED);
    // …and the checkbox did what it says.
    expect(row?.["member_iban"]).toBe(TYPED_NORMALIZED);
  });

  test("Fall C: an override IBAN is snapshotted, the stored account untouched", async ({
    page,
  }) => {
    const email = await seedMember("fallc", STORED_IBAN);
    await signIn(page, email);
    await page.goto("/portal/auslagen/neu");

    // Fall A by default — nothing to type, the stored account is confirmed.
    await expect(page.getByTestId("payout-masked-iban")).toBeVisible();
    // Open the override: Fall C.
    await page.getByTestId("payout-toggle").click();
    const ibanInput = page.getByTestId("payout-iban-input");
    await expect(ibanInput).toBeVisible();
    await expect(ibanInput).toHaveValue("");
    // "Nur für diese Einreichung" is the default — the profile must survive.
    await expect(page.getByTestId("payout-scope-once")).toBeChecked();
    await ibanInput.fill(TYPED_IBAN);
    await fillBlock(page);

    await page.getByTestId("auslage-submit").click();
    await expect(page.getByTestId("submit-handoff")).toBeVisible({
      timeout: 15_000,
    });

    const row = await newestSubmission(email);
    expect(row?.["erstattung_iban"]).toBe(TYPED_NORMALIZED);
    // The stored account is NOT overwritten by a one-off payout.
    expect(row?.["member_iban"]).toBe(STORED_IBAN);
  });

  test("submit explains the gap instead of sitting disabled (member arm)", async ({
    page,
  }) => {
    const email = await seedMember("gap", null);
    await signIn(page, email);
    await page.goto("/portal/auslagen/neu");

    const submit = page.getByTestId("auslage-submit");
    // Never disabled for a missing field — it has to be able to explain itself.
    await expect(submit).toBeEnabled();

    // Fall B with nothing typed: the first gap is the payout IBAN.
    await submit.click();
    await expect(page.getByTestId("payout-iban-input")).toBeFocused();
    await expect(page.getByTestId("einreichen-gate")).toContainText("IBAN");

    // With the IBAN in place the gate moves to the block — and names only the
    // fields that are ACTUALLY empty, not a blanket phrase.
    await page.getByTestId("payout-iban-input").fill(TYPED_IBAN);
    await page.getByTestId("amount-field-input").fill("19,90");
    await submit.click();
    const gate = page.getByTestId("einreichen-gate");
    await expect(gate).toContainText("Bezeichnung");
    await expect(gate).not.toContainText("Betrag");
  });

  test("batch receipt marks a documented Verzicht instead of leaving a gap", async ({
    page,
  }) => {
    const email = await seedMember("verzicht", STORED_IBAN);
    await signIn(page, email);
    await page.goto("/portal/auslagen/neu");

    await fillBlock(page);
    // Second block — the batch receipt only appears from two upwards.
    await page.getByTestId("add-auslage").click();
    const second = page.locator("[data-block]").last();
    await second
      .getByPlaceholder("z. B. Getränke fürs Sommerfest")
      .fill("E2E Zweite Auslage");
    await second.getByTestId("amount-field-input").fill("14,90");
    const d2 = second.getByTestId("date-field-input");
    await d2.fill("02.07.2026");
    await d2.blur();
    await second.getByTestId("beleg-kein-beleg").check();
    await second
      .getByTestId("beleg-verzicht-grund")
      .fill("E2E: zweiter Bon fehlt ebenfalls.");

    await page.getByTestId("auslage-submit").click();
    await expect(page.getByTestId("submit-handoff")).toBeVisible({
      timeout: 15_000,
    });

    // Both rows are Verzicht — the slot reads as a documented exception, not
    // as something missing.
    const markers = page.getByTestId("bcg-verzicht");
    await expect(markers).toHaveCount(2);
    await expect(markers.first()).toHaveText(/Verzicht begründet/);
  });

  test("Fall A: no typing needed, the stored IBAN is snapshotted", async ({
    page,
  }) => {
    const email = await seedMember("falla", STORED_IBAN);
    await signIn(page, email);
    await page.goto("/portal/auslagen/neu");

    await expect(page.getByTestId("payout-masked-iban")).toHaveText(
      "DE89 •••• 3000",
    );
    await expect(page.getByTestId("payout-iban-input")).toHaveCount(0);
    await fillBlock(page);

    await page.getByTestId("auslage-submit").click();
    await expect(page.getByTestId("submit-handoff")).toBeVisible({
      timeout: 15_000,
    });

    const row = await newestSubmission(email);
    expect(row?.["erstattung_iban"]).toBe(STORED_IBAN);
  });
});
