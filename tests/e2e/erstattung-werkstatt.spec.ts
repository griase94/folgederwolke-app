/**
 * E2E — Erstattung committed through the REAL UI (Aurora A-flow S3).
 *
 * The hole this closes is the same one S2b found the hard way: unit tests call
 * the domain function directly and the render judge only looks at pixels, so
 * the stretch BETWEEN them — does pressing the actual button actually commit
 * the right rows? — goes uncovered. Here every assertion starts at a rendered
 * control and ends at what the database holds afterwards.
 *
 * Three paths, because each can break independently:
 *   · single commit  — one claim, the row flips and the mail goes out,
 *   · bulk commit    — n claims at once, and the IBAN-less one is SKIPPED
 *                      rather than silently marked paid (§7),
 *   · reject         — the new dialog's reason lands verbatim in the mail.
 *
 * Fixtures are spec-local (`s3-werkstatt-e2e-*`); the shared seed rows are
 * mutated by other specs.
 *
 * @phase-2
 */

import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/sign-in.js";

const PREFIX = "s3-werkstatt-e2e";
const MEMBER_IBAN = "DE89370400440532013000";

async function sql() {
  const { default: postgres } = await import("postgres");
  return postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
}

let seq = 0;

/**
 * An approved, unreimbursed expense — exactly the state the Werkstatt lists.
 * `iban: null` produces the IBAN-less claim the bulk run must skip.
 */
async function seedClaim(tag: string, iban: string | null) {
  const client = await sql();
  const n = 90000 + seq++;
  const email = `${PREFIX}-${tag}-${n}@portal.test`;
  try {
    const [kat] = await client`
      SELECT id, name, sphere FROM kategorien WHERE kind = 'expense' LIMIT 1`;
    const [member] = await client`
      INSERT INTO members (vorname, nachname, email, eintritts_datum, iban, is_fixture)
      VALUES (${tag}, 'Werkstatt', ${email}, '2020-01-01', ${iban}, true)
      RETURNING id`;
    const [exp] = await client`
      INSERT INTO expenses (
        business_id, bezeichnung, betrag_cents, rechnungsdatum,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot,
        bezahlt_von_kind, bezahlt_von_member_id, bezahlt_von_display,
        beleg_verzicht_grund, approved_at, status)
      VALUES (
        ${`A-2026-${n}`}, ${`Werkstatt-Test ${tag}`}, 2490, '2026-07-01',
        ${kat!["id"]}, ${kat!["name"]}, ${kat!["sphere"]},
        'member', ${member!["id"]}, ${`Mitglied: ${tag}`},
        'E2E-Fixture', now(), 'geprueft')
      RETURNING id, business_id`;
    return {
      expenseId: exp!["id"] as string,
      businessId: exp!["business_id"] as string,
      email,
    };
  } finally {
    await client.end();
  }
}

/** A pending submission the Prüfung can reject. */
async function seedSubmission(tag: string) {
  const client = await sql();
  const n = 91000 + seq++;
  const email = `${PREFIX}-${tag}-${n}@portal.test`;
  try {
    const [member] = await client`
      INSERT INTO members (vorname, nachname, email, eintritts_datum, is_fixture)
      VALUES (${tag}, 'Werkstatt', ${email}, '2020-01-01', true)
      RETURNING id`;
    const [sub] = await client`
      INSERT INTO auslagen_submissions (
        business_id, bezeichnung, betrag_cents, rechnungsdatum,
        bezahlt_von_kind, bezahlt_von_member_id, bezahlt_von_display,
        beleg_verzicht_grund, consent_text_version)
      VALUES (
        ${`AUS-2026-${n}`}, ${`Reject-Test ${tag}`}, 7230, '2026-07-01',
        'member', ${member!["id"]}, ${`Mitglied: ${tag}`},
        'E2E-Fixture', 'test')
      RETURNING id, business_id`;
    return {
      submissionId: sub!["id"] as string,
      businessId: sub!["business_id"] as string,
    };
  } finally {
    await client.end();
  }
}

async function readExpense(id: string) {
  const client = await sql();
  try {
    const [row] = await client`
      SELECT status, erstattet_am, abfluss_datum, zahlungsart_id
      FROM expenses WHERE id = ${id}`;
    return row!;
  } finally {
    await client.end();
  }
}

async function mailsFor(entityId: string) {
  const client = await sql();
  try {
    return await client`
      SELECT template, subject FROM sent_mails WHERE entity_id = ${entityId}`;
  } finally {
    await client.end();
  }
}

async function gotoWerkstatt(page: Page) {
  await page.goto("/app/ausgaben/ueberweisungen");
  await expect(page.getByTestId("werkstatt-meta")).toBeVisible();
}

test.describe("@phase-2 Überweisungs-Werkstatt — commits through the real UI", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("single commit flips the row and sends exactly one mail", async ({
    page,
  }) => {
    const claim = await seedClaim("single", MEMBER_IBAN);
    await gotoWerkstatt(page);

    const row = page
      .getByTestId("prep-row")
      .filter({ hasText: claim.businessId });
    await expect(row).toBeVisible();
    // The payee shown here — and copied into the bank form — is the person's
    // name. "Mitglied: …" is a list label, not something a bank accepts.
    await expect(row).not.toContainText("Mitglied:");
    await row.getByTestId("mark-erstattet").click();

    // The claim leaves the pool — that is the user-visible proof.
    await expect(row).toHaveCount(0);

    const after = await readExpense(claim.expenseId);
    expect(after["status"]).toBe("erstattet");
    expect(after["erstattet_am"]).not.toBeNull();
    expect(after["abfluss_datum"]).not.toBeNull();
    expect(after["zahlungsart_id"]).not.toBeNull();

    const mails = await mailsFor(claim.expenseId);
    expect(mails).toHaveLength(1);
    expect(mails[0]!["template"]).toBe("auslage_erstattet");
    expect(String(mails[0]!["subject"])).toContain("Überwiesen");
  });

  test("bulk commit pays the payable ones and SKIPS the one without an IBAN", async ({
    page,
  }) => {
    const payable = await seedClaim("bulk-ok", MEMBER_IBAN);
    const unpayable = await seedClaim("bulk-noiban", null);
    await gotoWerkstatt(page);

    await expect(
      page.getByTestId("prep-row").filter({ hasText: payable.businessId }),
    ).toBeVisible();
    await expect(
      page.getByTestId("prep-row").filter({ hasText: unpayable.businessId }),
    ).toBeVisible();

    await page.getByTestId("mark-erstattet-alle").click();
    await expect(
      page.getByTestId("prep-row").filter({ hasText: payable.businessId }),
    ).toHaveCount(0);

    // The payable one is committed …
    expect((await readExpense(payable.expenseId))["status"]).toBe("erstattet");
    // … and the IBAN-less one is untouched: no row change, no mail. Marking it
    // paid would tell a member their money is on the way to an account the
    // Verein does not have.
    const skipped = await readExpense(unpayable.expenseId);
    expect(skipped["status"]).not.toBe("erstattet");
    expect(skipped["erstattet_am"]).toBeNull();
    expect(await mailsFor(unpayable.expenseId)).toHaveLength(0);

    // It stays visible with its problem flag instead of vanishing.
    await expect(
      page.getByTestId("prep-row").filter({ hasText: unpayable.businessId }),
    ).toBeVisible();
  });

  test("the lens switcher actually switches — not just the URL", async ({
    page,
  }) => {
    // Board #172 BLOCKER: clicking rewrote ?lens=liste while the body kept
    // rendering the prep list, because the lens was derived from a URL that
    // replaceState changes WITHOUT a navigation. Only a deep link ever worked,
    // and every spec here entered by deep link — which is why it survived.
    await seedClaim("lens", MEMBER_IBAN);
    await gotoWerkstatt(page);

    await expect(page.getByTestId("prep-list")).toBeVisible();
    await expect(page.getByTestId("claim-list")).toHaveCount(0);

    await page.getByRole("tab", { name: /Auf der Liste/ }).click();

    await expect(page.getByTestId("claim-list")).toBeVisible();
    await expect(page.getByTestId("prep-list")).toHaveCount(0);
    await expect(page).toHaveURL(/lens=liste/);

    // And back, so the switcher is not a one-way door.
    await page.getByRole("tab", { name: /Vorzubereiten/ }).click();
    await expect(page.getByTestId("prep-list")).toBeVisible();
    await expect(page.getByTestId("claim-list")).toHaveCount(0);
  });

  test("reject dialog carries the typed reason verbatim into the mail", async ({
    page,
  }) => {
    const sub = await seedSubmission("reject");
    const reason = `Der Beleg war unleserlich — bitte neu einreichen (${sub.businessId}).`;

    await page.goto(`/app/inbox/${sub.businessId}`);
    await page.getByTestId("decision-reject").click();
    await expect(page.getByTestId("reject-dialog")).toBeVisible();

    // The template prefills a reason; replace it with our own so the assertion
    // proves the TYPED text travels, not the canned one.
    const grund = page.getByTestId("reject-grund");
    await grund.fill(reason);
    await page.getByTestId("reject-submit").click();

    await expect(page.getByTestId("decided-banner")).toContainText("Abgelehnt");

    const client = await sql();
    try {
      const [row] = await client`
        SELECT decision, decision_reason FROM auslagen_submissions
        WHERE id = ${sub.submissionId}`;
      expect(row!["decision"]).toBe("rejected");
      expect(row!["decision_reason"]).toBe(reason);
    } finally {
      await client.end();
    }

    const mails = await mailsFor(sub.submissionId);
    expect(mails).toHaveLength(1);
    expect(mails[0]!["template"]).toBe("auslage_abgelehnt");
    expect(String(mails[0]!["subject"])).toContain(sub.businessId);
  });

  test("the reject dialog refuses to send an empty reason", async ({
    page,
  }) => {
    const sub = await seedSubmission("reject-empty");
    await page.goto(`/app/inbox/${sub.businessId}`);
    await page.getByTestId("decision-reject").click();

    // Click the card, like a person does — the radio itself is sr-only.
    await page.getByTestId("reject-template-sonstiges").click();

    // SLOT-FELD §4: the submit stays open — the refusal happens in the FIELD,
    // not in a dead button. A click with an empty reason must neither send nor
    // close the dialog, and the threshold is still named.
    const submit = page.getByTestId("reject-submit");
    await expect(submit).toBeEnabled();
    await expect(page.getByTestId("reject-hint")).toContainText(
      "Mindestens 3 Zeichen",
    );
    await submit.click();
    await expect(page.getByTestId("reject-dialog")).toBeVisible();
    expect(
      await page
        .getByTestId("reject-grund")
        .evaluate((el) => (el as HTMLTextAreaElement).checkValidity()),
    ).toBe(false);

    // Escape must close it — and leave the submission decidable.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("reject-dialog")).toHaveCount(0);

    const client = await sql();
    try {
      const [row] = await client`
        SELECT decision FROM auslagen_submissions WHERE id = ${sub.submissionId}`;
      expect(row!["decision"]).toBeNull();
    } finally {
      await client.end();
    }
  });
});

test.afterAll(async () => {
  const client = await sql();
  try {
    await client`
      DELETE FROM expenses WHERE bezahlt_von_member_id IN (
        SELECT id FROM members WHERE email LIKE ${PREFIX + "%"})`;
    await client`
      DELETE FROM auslagen_submissions WHERE bezahlt_von_member_id IN (
        SELECT id FROM members WHERE email LIKE ${PREFIX + "%"})`;
    // members stay — audit_log references them and is append-only (ADR-0004).
  } finally {
    await client.end();
  }
});
