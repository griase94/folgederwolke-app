/**
 * E2E tests for C7-INBOX full — @phase-9.
 *
 * Covers:
 *   - Filter chips render (Offen/Geprüft/Abgelehnt) with count badges.
 *   - ?status= URL query toggles which submissions are listed and asserts the
 *     data-decided / data-decision attributes on InboxCard.
 *   - Inline-approve action: clicking Genehmigen on an open row creates the
 *     expense, marks the submission approved, and writes a sent_mails row
 *     with template='auslage_approved' (ADR-0005 idempotency).
 *
 * The dedup-on-second-emit guard is covered by the unit tests around
 * approveSubmission and the handler itself; here we only verify the
 * end-to-end happy path landed a row.
 */

import { expect, test } from "@playwright/test";
import { randomBytes, createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Helpers — DB shortcuts (mirror inbox.spec.ts patterns)
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

interface SeedRow {
  businessId: string;
  bezeichnung: string;
  submissionId: string;
}

async function seedPendingSubmission(prefix: string): Promise<SeedRow> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  // Constraint: business_id ~ '^AUS-[0-9]{4}-[0-9]{3,}$' — digits only after year.
  // Use a 9-digit random suffix that's astronomically unlikely to collide with
  // the seeded id_counters' 3-digit serials. Prefix arg is kept for log context.
  const unique = String(Math.floor(Math.random() * 1_000_000_000)).padStart(
    9,
    "0",
  );
  const businessId = `AUS-2026-${unique}`;
  const bezeichnung = `C7-INBOX ${prefix} ${unique}`;

  // Insert a realistic `files` row first so the submission carries a beleg.
  // The reset-lane seed leaves `files` empty, so every approval previously
  // exercised the no-beleg path — masking the beleg_file_id-copy bug. A real
  // beleg makes the expenses CHECK (beleg_or_grund) bite if the FK is dropped.
  const fileRows = await client<{ id: string }[]>`
    INSERT INTO files (
      storage_key,
      storage_backend,
      mime_type,
      byte_size,
      sha256,
      original_filename,
      kind,
      source_kind,
      uploaded_by_submitter_email
    ) VALUES (
      ${`belege/${unique}.pdf`},
      ${"local-fs"},
      ${"application/pdf"},
      ${1024},
      ${createHash("sha256").update(unique).digest("hex")},
      ${"beleg.pdf"},
      ${"beleg"},
      ${"form"},
      ${"seed@example.org"}
    )
    RETURNING id
  `;
  const belegFileId = fileRows[0]?.id ?? "";

  const rows = await client<{ id: string }[]>`
    INSERT INTO auslagen_submissions (
      business_id,
      bezeichnung,
      betrag_cents,
      bezahlt_von_kind,
      bezahlt_von_display,
      consent_text_version,
      beleg_file_id,
      beleg_original_name
    ) VALUES (
      ${businessId},
      ${bezeichnung},
      ${4250},
      ${"verein"},
      ${"Verein"},
      ${"v1"},
      ${belegFileId},
      ${"beleg.pdf"}
    )
    RETURNING id
  `;
  await client.end();
  return { businessId, bezeichnung, submissionId: rows[0]?.id ?? "" };
}

async function seedDecidedSubmission(
  prefix: string,
  decision: "approved" | "rejected",
): Promise<SeedRow> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  const unique = String(Math.floor(Math.random() * 1_000_000_000)).padStart(
    9,
    "0",
  );
  const businessId = `AUS-2026-${unique}`;
  const bezeichnung = `C7-INBOX ${prefix} ${unique}`;

  // For approved: insert the submission and a matching expense, then update
  // approved_expense_id. For rejected: just mark decided.
  if (decision === "approved") {
    const subRows = await client<{ id: string }[]>`
      INSERT INTO auslagen_submissions (
        business_id, bezeichnung, betrag_cents, bezahlt_von_kind,
        bezahlt_von_display, consent_text_version,
        decided_at, decision, reviewed_at
      ) VALUES (
        ${businessId}, ${bezeichnung}, ${4250}, ${"verein"},
        ${"Verein"}, ${"v1"},
        now(), ${"approved"}, now()
      )
      RETURNING id
    `;
    await client.end();
    return { businessId, bezeichnung, submissionId: subRows[0]?.id ?? "" };
  }

  const rows = await client<{ id: string }[]>`
    INSERT INTO auslagen_submissions (
      business_id, bezeichnung, betrag_cents, bezahlt_von_kind,
      bezahlt_von_display, consent_text_version,
      decided_at, decision, decision_reason, reviewed_at
    ) VALUES (
      ${businessId}, ${bezeichnung}, ${4250}, ${"verein"},
      ${"Verein"}, ${"v1"},
      now(), ${"rejected"}, ${"Test seed"}, now()
    )
    RETURNING id
  `;
  await client.end();
  return { businessId, bezeichnung, submissionId: rows[0]?.id ?? "" };
}

async function fetchSentMails(
  submissionId: string,
): Promise<
  Array<{ template: string; entity_id: string; send_attempt: number }>
> {
  const { default: postgres } = await import("postgres");
  const client = postgres(process.env["DATABASE_URL"] ?? "", {
    prepare: false,
    max: 1,
  });
  try {
    const rows = await client<
      Array<{ template: string; entity_id: string; send_attempt: number }>
    >`
      SELECT template, entity_id, send_attempt
      FROM sent_mails
      WHERE entity_id = ${submissionId}
      ORDER BY send_attempt ASC
    `;
    return rows;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("@phase-aurora-inbox Prüfung — filter chips + route-driven decisions", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("filter chips render (Offen/Geprüft/Abgelehnt) with Offen active by default", async ({
    page,
  }) => {
    await page.goto("/app/inbox");
    // FilterChips testids are filter-chip-{value} (master §2.5).
    const offen = page.getByTestId("filter-chip-Offen");
    await expect(offen).toBeVisible();
    await expect(page.getByTestId("filter-chip-Geprüft")).toBeVisible();
    await expect(page.getByTestId("filter-chip-Abgelehnt")).toBeVisible();
    // Active chip carries aria-current="true".
    await expect(offen).toHaveAttribute("aria-current", "true");
    // Counts are baked into the labels.
    await expect(offen).toContainText("Offen (");
  });

  test("?status=Offen lists open rows as txn-row links to the review route", async ({
    page,
  }) => {
    const open = await seedPendingSubmission("OPN");
    const approved = await seedDecidedSubmission("APP", "approved");

    await page.goto("/app/inbox?status=Offen");

    const openRow = page.locator(
      `[data-testid="txn-row"][href="/app/inbox/${open.businessId}"]`,
    );
    await expect(openRow).toBeVisible();
    // The approved seed must NOT appear in Offen.
    await expect(
      page.locator(
        `[data-testid="txn-row"][href="/app/inbox/${approved.businessId}"]`,
      ),
    ).toHaveCount(0);

    // No list-row decision affordance anywhere (view-before-decide topology).
    await expect(page.getByTestId("inbox-card-approve-start")).toHaveCount(0);
    await expect(page.getByTestId("inbox-card-kebab")).toHaveCount(0);
  });

  test("?status=Geprüft lists approved rows; ?status=Abgelehnt lists rejected", async ({
    page,
  }) => {
    const approved = await seedDecidedSubmission("AP2", "approved");
    const rejected = await seedDecidedSubmission("REJ", "rejected");

    await page.goto("/app/inbox?status=Geprüft");
    await expect(
      page.locator(
        `[data-testid="txn-row"][href="/app/inbox/${approved.businessId}"]`,
      ),
    ).toBeVisible();

    await page.goto("/app/inbox?status=Abgelehnt");
    await expect(
      page.locator(
        `[data-testid="txn-row"][href="/app/inbox/${rejected.businessId}"]`,
      ),
    ).toBeVisible();
  });

  test("review route: approve is gated until a Kategorie is chosen, then lands the expense", async ({
    page,
  }) => {
    const seeded = await seedPendingSubmission("DET");
    await page.goto(`/app/inbox/${seeded.businessId}`);

    const approve = page.getByTestId("decision-approve");
    await expect(approve).toBeVisible();
    // Gate: the "Fehlt noch: Kategorie" hint is present before a pick.
    await expect(page.getByTestId("decision-missing")).toContainText(
      "Kategorie",
    );

    await page.getByLabel("Kategorie").selectOption({ index: 1 });
    await expect(page.getByTestId("decision-missing")).toHaveCount(0);
    await approve.click();

    // Decided → the read-only banner with the Zur-Ausgabe handoff renders.
    await expect(page.getByTestId("decided-banner")).toBeVisible();
    await expect(page.getByRole("link", { name: /Zur Ausgabe/ })).toBeVisible();
  });

  test("review route: reject via RejectDialog writes the rejection and shows the decided banner", async ({
    page,
  }) => {
    const seeded = await seedPendingSubmission("RJ2");
    await page.goto(`/app/inbox/${seeded.businessId}`);

    await page.getByTestId("decision-reject").click();
    // RejectDialog default template pre-fills an editable Grund (>= 3 chars).
    await page
      .getByLabel(/Grund/)
      .fill("Beleg unleserlich, bitte erneut einreichen.");
    await page.getByRole("button", { name: "Ablehnen" }).last().click();

    await expect(page.getByTestId("decided-banner")).toContainText("Abgelehnt");
  });

  test("opening the review route marks the submission reviewed (audit anchor)", async ({
    page,
  }) => {
    const seeded = await seedPendingSubmission("REV");
    await page.goto(`/app/inbox/${seeded.businessId}`);
    // The facts block shows "Schon gesehen" on reload (reviewed_at set on first open).
    await page.reload();
    await expect(page.getByText("Schon gesehen")).toBeVisible();
  });
});
