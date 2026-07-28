/**
 * Deterministic Auslagen fixtures for the public-chain e2e specs (Aurora A-flow
 * S1). The global seed carries no auslagen_submissions rows, so the confirmation
 * + status specs seed their own — with FIXED business-ids (high seq, so they
 * never collide with the allocator's 001+ ids that a live submit test burns) and
 * FIXED dates (nothing run-date-dependent, so assertions stay stable).
 *
 * Superuser (DIRECT_DATABASE_URL) insert so we bypass the app_runtime triggers,
 * same pattern as the integration tests. Beleg is satisfied via a verzicht-grund
 * (no files FK needed) while beleg_original_name still drives the Beleg-line.
 */
import postgres from "postgres";

const SUBMITTED = "2026-07-04T09:04:00Z";
const DECIDED = "2026-07-06T10:00:00Z";
export const GROUP_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

/** Single, in Prüfung. Confirmation single + status single. */
export const SINGLE_ID = "AUS-2026-901";
/** Batch group: in Prüfung / abgelehnt (with reason) / freigegeben. */
export const BATCH_IDS = [
  "AUS-2026-911",
  "AUS-2026-912",
  "AUS-2026-913",
] as const;
export const REJECT_REASON =
  "Der Beleg war leider nicht lesbar — Datum und Betrag ließen sich auf dem Foto nicht erkennen. Mach bitte ein schärferes Bild und reich die Auslage einfach nochmal ein.";

interface Row {
  biz: string;
  group: string | null;
  bez: string;
  cents: number;
  reviewed: string | null;
  decided: string | null;
  decision: string | null;
  reason: string | null;
}

const ROWS: Row[] = [
  {
    biz: SINGLE_ID,
    group: null,
    bez: "Getränke fürs Sommerfest",
    cents: 2490,
    reviewed: SUBMITTED,
    decided: null,
    decision: null,
    reason: null,
  },
  {
    biz: BATCH_IDS[0],
    group: GROUP_ID,
    bez: "Kuchen fürs Sommerfest",
    cents: 2490,
    reviewed: SUBMITTED,
    decided: null,
    decision: null,
    reason: null,
  },
  {
    biz: BATCH_IDS[1],
    group: GROUP_ID,
    bez: "Standmiete Flohmarkt",
    cents: 1490,
    reviewed: null,
    decided: DECIDED,
    decision: "rejected",
    reason: REJECT_REASON,
  },
  {
    biz: BATCH_IDS[2],
    group: GROUP_ID,
    bez: "Deko & Lichterketten",
    cents: 2390,
    reviewed: null,
    decided: DECIDED,
    decision: "approved",
    reason: null,
  },
];

const ALL_IDS = [SINGLE_ID, ...BATCH_IDS];

function client() {
  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url)
    throw new Error("DIRECT_DATABASE_URL not set — cannot seed e2e fixtures");
  return postgres(url, { prepare: false, max: 1 });
}

export async function seedAuslagenFixtures(): Promise<void> {
  const sql = client();
  try {
    // Idempotent: a re-run (retry) overwrites nothing but never duplicates.
    await sql`DELETE FROM auslagen_submissions WHERE business_id = ANY(${ALL_IDS})`;
    for (const r of ROWS) {
      await sql`
        INSERT INTO auslagen_submissions
          (business_id, submission_group_id, bezeichnung, betrag_cents, currency,
           rechnungsdatum, submitted_at, bezahlt_von_kind, extern_name, extern_iban,
           extern_email, bezahlt_von_display, beleg_original_name, beleg_verzicht_grund,
           consent_text_version, reviewed_at, decided_at, decision, decision_reason)
        VALUES
          (${r.biz}, ${r.group}, ${r.bez}, ${r.cents}, 'EUR',
           '2026-07-04', ${SUBMITTED}, 'extern', 'Anna Müller', 'DE89370400440532013000',
           'anna@example.org', 'Extern: Anna Müller (DE89...3000)',
           'Beleg_Sommerfest.jpg', 'e2e-fixture',
           'test-1', ${r.reviewed}, ${r.decided}, ${r.decision}, ${r.reason})`;
    }
  } finally {
    await sql.end();
  }
}

export async function cleanupAuslagenFixtures(): Promise<void> {
  const sql = client();
  try {
    await sql`DELETE FROM auslagen_submissions WHERE business_id = ANY(${ALL_IDS})`;
  } finally {
    await sql.end();
  }
}
