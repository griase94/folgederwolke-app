/**
 * Fixture-only seed — the Aurora design-canon demo dataset.
 *
 * Installs the 6+1 Mitglieder-Roster, the Kunden cast, the §15 Projekte cast,
 * per-year Beitragssätze + Beitrags-Rows, and a showcase transaction corpus,
 * all `is_fixture=true` (or fixture-adjacent config) so the app renders like
 * the abgenommene Aurora design plates before the Phase 6 importer ingests
 * the real legacy data.
 *
 * Canon source: `.superpowers/mockups/_kit/FIXTURES.md`
 *   - Roster 6+1 (§16 + briefs/_flow-mitglieder.md): Anna Müller / Lena Hofmann /
 *     Felix Bauer (2026 bezahlt) · Jonas Köhler (überfällig) · Tim Schäfer
 *     (offen, 2025 teilbezahlt 30,00/69,69) · Test User (offen) · Renate Albrecht
 *     (dauerhaft befreit — Ehrenmitglied). Regelbeitrag 69,69 € = 6969 cents.
 *   - Kunden (§ rechnungen): Cremosa GmbH · Maria Huber (Privatperson) ·
 *     Kulturkreis Pankow e.V. · Musikschule Klangraum · Altpapier & Söhne (archiviert).
 *   - Projekte (§15): the 7-project cast; Sommerfest 2026 is the Detail-Held.
 *     Project sphere_default stays NULL (the per-project sphere concept is
 *     product-side removed — do NOT set it).
 *   - Kassenwärtin persona = Julia Brunner (settings `verein.kassenwaert_name`,
 *     seeded in scripts/seed.ts — a free Stammdatum, NOT a member reference).
 *
 * Beitrags-Kanon: at the current Buchungsjahr the roster reads "3 von 6 bezahlt ·
 * 209,07 €" (Anna/Lena/Felix paid, Jonas/Tim/Test User open, Renate exempt +
 * excluded from the denominator) — FIXTURES §13a. Overdue-vs-open among the
 * unpaid three is a function of the single per-year Fälligkeit and the current
 * date; the data model has one Fälligkeit per year, so all unpaid current-year
 * members share the honest computed offen/überfällig state.
 *
 * Idempotency: keyed on natural identifiers via existence-check (members'
 * email_canonical and customers' name aren't UNIQUE in the schema; we look
 * them up before INSERT instead of relying on ON CONFLICT). Projects have
 * UNIQUE(business_id), Beitragssätze a PK(year), and member_beitrags a
 * UNIQUE(member_id, year), so ON CONFLICT works directly there.
 *
 * Phase 6 hard-cutover step deletes WHERE is_fixture=true before importing.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import * as schema from "../src/lib/server/db/schema/index.js";
import { canonicalizeEmail } from "../src/lib/domain/email.js";
import { DATENSCHUTZ_VERSION } from "../src/lib/domain/datenschutz.js";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Client = ReturnType<typeof postgres>;
/** Steuerliche Sphäre — the `sphere` pgEnum's value union. */
type Sphere = (typeof schema.sphereEnum.enumValues)[number];

/** Regelbeitrag — 69,69 € in cents (FIXTURES §0/§16c). Stable across years. */
const REGELBEITRAG_CENTS = 6969n;

type MemberFixture = {
  vorname: string;
  nachname: string;
  /** null → the „Keine E-Mail"-Demo (Renate Albrecht, FIXTURES §3). */
  email: string | null;
  role: (typeof schema.memberRoleEnum.enumValues)[number];
  eintrittsDatum: string;
  beitragExempt?: boolean;
  beitragExemptReason?: string;
};

// Roster 6+1 (FIXTURES §16 + briefs/_flow-mitglieder.md §3). Display order in
// the matrix is by nachname; insertion order here is free.
const MEMBERS: MemberFixture[] = [
  {
    vorname: "Anna",
    nachname: "Müller",
    email: "anna.mueller@example.de",
    role: "mitglied",
    eintrittsDatum: "2020-05-01",
  },
  {
    vorname: "Lena",
    nachname: "Hofmann",
    email: "lena.hofmann@example.de",
    role: "vorstand", // Vorsitzende (FIXTURES §16b)
    eintrittsDatum: "2019-02-01",
  },
  {
    vorname: "Felix",
    nachname: "Bauer",
    email: "felix.bauer@example.de",
    role: "kassenwart", // Vorstands-Rolle (FIXTURES §16b); Julia Brunner
    // unterschreibt separat als Stammdatum-Kassenwärtin.
    eintrittsDatum: "2019-06-01",
  },
  {
    vorname: "Jonas",
    nachname: "Köhler",
    email: "jonas.koehler@example.de",
    role: "mitglied", // überfällig — kanonischer Reminder-Empfänger (§16f)
    eintrittsDatum: "2022-09-01",
  },
  {
    vorname: "Tim",
    nachname: "Schäfer",
    email: "tim.schaefer@example.de",
    role: "mitglied", // offen 2026; 2025 teilbezahlt (30,00 / 69,69)
    eintrittsDatum: "2023-03-01",
  },
  {
    vorname: "Test",
    nachname: "User",
    // Andys Test-Login — kanonischer Plate-Wert (FIXTURES §3 Z.579). Mail-Versand
    // ist in dev/test no-op, daher keine echte Zustellung.
    email: "andy.griesbeck+test@gmail.com",
    role: "mitglied", // offen 2026
    eintrittsDatum: "2024-01-15",
  },
  {
    vorname: "Renate",
    nachname: "Albrecht",
    // KEINE E-Mail — der kanonische „Keine E-Mail"-Demo-Fall (FIXTURES §3 Z.580).
    // Als dauerhaft Befreite ist sie ohnehin nie Reminder-Kandidatin.
    email: null,
    role: "mitglied",
    eintrittsDatum: "2015-01-01",
    beitragExempt: true,
    beitragExemptReason: "Ehrenmitglied seit 2019 — Beitrag dauerhaft erlassen",
  },
];

type ProjectFixture = {
  businessId: string;
  name: string;
  startDate: string;
  endDate: string | null;
  /** ISO timestamp when soft-deleted (archiviert). */
  archivedAt?: string;
};

// Projekte-Kanon (FIXTURES §15a). sphere_default stays NULL for every project —
// the per-project sphere concept is product-side removed. The archived project
// carries deletedAt (the projekte list filters deletedAt IS NULL, so it shows
// the six active projects).
const PROJECTS: ProjectFixture[] = [
  {
    businessId: "P-2026-003",
    name: "Sommerfest 2026",
    startDate: "2026-03-15",
    endDate: "2026-10-31",
  },
  {
    businessId: "P-2026-004",
    name: "Kinder-Sommercamp",
    startDate: "2026-07-22",
    endDate: "2026-08-05",
  },
  {
    businessId: "P-2026-001",
    name: "Merch & Vereinsshop",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  },
  {
    businessId: "P-2026-005",
    name: "Benefiz-Konzert Herbst",
    startDate: "2026-10-12",
    endDate: "2026-10-12",
  },
  {
    businessId: "P-2026-002",
    name: "Vereinsheim-Renovierung",
    startDate: "2026-03-15",
    endDate: null,
  },
  {
    businessId: "P-2026-006",
    name: "Neujahrs-Wanderung",
    startDate: "2026-01-06",
    endDate: "2026-01-06",
  },
  {
    businessId: "P-2025-004",
    name: "Weihnachtsmarkt-Stand 2025",
    startDate: "2025-11-25",
    endDate: "2025-12-24",
    archivedAt: "2026-01-12T10:00:00Z",
  },
];

type CustomerFixture = {
  name: string;
  anrede: string;
  addressBlock: string;
  country?: string;
  /** ISO timestamp when soft-deleted (archiviert). */
  archivedAt?: string;
};

// Kunden-Kast. Cremosa GmbH is the customer of the two paid Frühlingsfest
// invoices (FDW-2026-001/002); FDW-2026-001 links to income E-2026-905.
const CUSTOMERS: CustomerFixture[] = [
  {
    name: "Cremosa GmbH",
    anrede: "Sehr geehrte Damen und Herren",
    addressBlock: "Cremosa GmbH\nMaximilianstraße 12\n80539 München",
  },
  {
    name: "Maria Huber",
    anrede: "Liebe Frau Huber",
    addressBlock: "Maria Huber\nRosenheimer Straße 45\n81667 München",
  },
  {
    name: "Kulturkreis Pankow e.V.",
    anrede: "Sehr geehrte Damen und Herren",
    addressBlock: "Kulturkreis Pankow e.V.\nFlorastraße 84\n13187 Berlin",
  },
  {
    name: "Musikschule Klangraum",
    anrede: "Sehr geehrte Damen und Herren",
    addressBlock: "Musikschule Klangraum\nLindenallee 7\n80802 München",
  },
  {
    name: "Altpapier & Söhne",
    anrede: "Sehr geehrte Damen und Herren",
    addressBlock: "Altpapier & Söhne\nGewerbestraße 3\n85748 Garching",
    archivedAt: "2026-02-20T10:00:00Z",
  },
];

export async function seedFixtures(db: Db): Promise<void> {
  console.log("seed-fixtures: members …");
  for (const m of MEMBERS) {
    const emailCanonical = m.email ? canonicalizeEmail(m.email) : null;
    // Dedup by canonical email when present; the one email-less member
    // (Renate) is deduped by name instead.
    const existing = await db
      .select({ id: schema.members.id })
      .from(schema.members)
      .where(
        and(
          emailCanonical
            ? eq(schema.members.emailCanonical, emailCanonical)
            : and(
                eq(schema.members.vorname, m.vorname),
                eq(schema.members.nachname, m.nachname),
              ),
          eq(schema.members.isFixture, true),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(schema.members).values({
      vorname: m.vorname,
      nachname: m.nachname,
      email: m.email,
      emailCanonical,
      role: m.role,
      eintrittsDatum: m.eintrittsDatum,
      beitragExempt: m.beitragExempt ?? false,
      beitragExemptReason: m.beitragExempt
        ? (m.beitragExemptReason ?? "Befreit")
        : null,
      isFixture: true,
    });
  }

  console.log("seed-fixtures: projects …");
  for (const p of PROJECTS) {
    // projects.business_id is UNIQUE — onConflictDoNothing works.
    await db
      .insert(schema.projects)
      .values({
        businessId: p.businessId,
        name: p.name,
        // sphere_default intentionally NULL (per-project sphere removed).
        startDate: p.startDate,
        endDate: p.endDate,
        deletedAt: p.archivedAt ? new Date(p.archivedAt) : null,
        isFixture: true,
      })
      .onConflictDoNothing({ target: schema.projects.businessId });
  }

  console.log("seed-fixtures: customers …");
  for (const c of CUSTOMERS) {
    const existing = await db
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.name, c.name),
          eq(schema.customers.isFixture, true),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(schema.customers).values({
      name: c.name,
      anrede: c.anrede,
      addressBlock: c.addressBlock,
      country: c.country ?? "DE",
      deletedAt: c.archivedAt ? new Date(c.archivedAt) : null,
      isFixture: true,
    });
  }

  // Beitragssätze + Beitrags-Rows — depend on the members seeded above.
  await seedBeitraege(db);

  // Transaction corpus — depends on kategorien (reference data) + the
  // members/projects/customers fixtures seeded above.
  await seedTransactionCorpus(db);

  // Festschreibung 2024 (ADR-0006 · FIXTURES §16c · mitglieder-spec §3): lock
  // Buchungsjahr 2024 so the matrix/EÜR render the canonical 🔒 lock badge.
  // Set LAST — the assert_not_festgeschrieben trigger (migration 0014) blocks
  // INSERTs into a locked year on income/expenses/donations/invoices, so every
  // 2024 corpus row (and every paid-2024 Beitrags-Row) must already be in place.
  // onConflictDoNothing keeps a higher admin-set value on re-seed (never lowers).
  // value is a JSON number (matrix-loader + isYearClosed both accept number).
  await db
    .insert(schema.settings)
    .values({ key: "festgeschrieben_bis", value: 2024 })
    .onConflictDoNothing({ target: schema.settings.key });
}

// ---------------------------------------------------------------------------
// Beitrags-Kanon (FIXTURES §13a / §16c)
// ---------------------------------------------------------------------------
//
// Per-year Beitragssatz (69,69 €, Fälligkeit 31.03.) for the trailing window
// 2024/2025/2026, plus member_beitrags rows so the roster reads its canonical
// per-year states (mitglieder-spec §3 · FIXTURES §13a/§16c):
//
//   Mitglied        | 2024        | 2025            | 2026
//   ----------------|-------------|-----------------|-----------
//   Anna Müller     | bezahlt 🔒  | bezahlt         | bezahlt 12.06.
//   Lena Hofmann    | bezahlt 🔒  | bezahlt         | bezahlt 28.05.
//   Felix Bauer     | bezahlt 🔒  | bezahlt         | bezahlt 14.05.
//   Jonas Köhler    | bezahlt 🔒  | bezahlt         | überfällig  (no row)
//   Tim Schäfer     | bezahlt 🔒  | teilbez. 30/69,69| offen      (no row)
//   Test User       | bezahlt 🔒  | bezahlt         | offen       (no row)
//   Renate Albrecht | ⌀ befreit   | ⌀              | ⌀          (member.beitrag_exempt)
//
// 2024 is festgeschrieben (festgeschrieben_bis = 2024, set at the END of the
// seed). CRUCIAL: every member applicable in 2024 must be paid or exempt —
// an unpaid cell in a locked year is the impossible "locked-and-overdue"
// state, so Jonas/Tim/Test User carry paid 2024 rows too. Only the CURRENT
// year (2026, not locked) carries the honest open/overdue cells → header
// "3/6 bezahlt · 209,07 €" (Anna+Lena+Felix). The 2026 paid dates match the
// Flow-B feed (FIXTURES §13b). offen-vs-überfällig among the unpaid 2026
// three is a function of the single per-year Fälligkeit + today's date (one
// Fälligkeit per year — documented limitation).

type BeitragSeed = {
  memberEmail: string;
  year: number;
  paidCents: bigint;
  gezahltAm: string | null;
  notes?: string;
};

const P = REGELBEITRAG_CENTS;

const BEITRAG_ROWS: BeitragSeed[] = [
  // Anna Müller — durchgängig bezahlt (2026 = 12.06., FIXTURES §13b).
  {
    memberEmail: "anna.mueller@example.de",
    year: 2024,
    paidCents: P,
    gezahltAm: "2024-02-15",
  },
  {
    memberEmail: "anna.mueller@example.de",
    year: 2025,
    paidCents: P,
    gezahltAm: "2025-02-15",
  },
  {
    memberEmail: "anna.mueller@example.de",
    year: 2026,
    paidCents: P,
    gezahltAm: "2026-06-12",
  },
  // Lena Hofmann — durchgängig bezahlt (2026 = 28.05.).
  {
    memberEmail: "lena.hofmann@example.de",
    year: 2024,
    paidCents: P,
    gezahltAm: "2024-01-22",
  },
  {
    memberEmail: "lena.hofmann@example.de",
    year: 2025,
    paidCents: P,
    gezahltAm: "2025-01-20",
  },
  {
    memberEmail: "lena.hofmann@example.de",
    year: 2026,
    paidCents: P,
    gezahltAm: "2026-05-28",
  },
  // Felix Bauer — durchgängig bezahlt (2026 = 14.05.).
  {
    memberEmail: "felix.bauer@example.de",
    year: 2024,
    paidCents: P,
    gezahltAm: "2024-03-10",
  },
  {
    memberEmail: "felix.bauer@example.de",
    year: 2025,
    paidCents: P,
    gezahltAm: "2025-03-08",
  },
  {
    memberEmail: "felix.bauer@example.de",
    year: 2026,
    paidCents: P,
    gezahltAm: "2026-05-14",
  },
  // Jonas Köhler — bezahlt 2024+2025, 2026 überfällig (no 2026 row).
  {
    memberEmail: "jonas.koehler@example.de",
    year: 2024,
    paidCents: P,
    gezahltAm: "2024-02-20",
  },
  {
    memberEmail: "jonas.koehler@example.de",
    year: 2025,
    paidCents: P,
    gezahltAm: "2025-02-18",
  },
  // Tim Schäfer — bezahlt 2024, 2025 teilbezahlt (30,00 / 69,69), 2026 offen.
  {
    memberEmail: "tim.schaefer@example.de",
    year: 2024,
    paidCents: P,
    gezahltAm: "2024-03-05",
  },
  {
    memberEmail: "tim.schaefer@example.de",
    year: 2025,
    paidCents: 3000n,
    gezahltAm: "2025-04-10",
    notes: "Teilzahlung 30,00 € — Restbetrag 39,69 € offen",
  },
  // Test User — bezahlt 2024+2025, 2026 offen (no 2026 row).
  {
    memberEmail: "andy.griesbeck+test@gmail.com",
    year: 2024,
    paidCents: P,
    gezahltAm: "2024-02-25",
  },
  {
    memberEmail: "andy.griesbeck+test@gmail.com",
    year: 2025,
    paidCents: P,
    gezahltAm: "2025-02-22",
  },
  // Renate Albrecht: permanent exempt via members.beitrag_exempt → NO rows.
];

async function seedBeitraege(db: Db): Promise<void> {
  console.log("seed-fixtures: beitragssätze + beitrags-rows …");

  // Per-year Beitragssatz + Fälligkeit 31.03. + Beschluss-Notiz (FIXTURES §16c).
  // Migration 0026 pre-seeds these years with a neutral "Initial migration
  // default" note and NO Fälligkeit; onConflictDoUpdate applies the canon
  // Beschluss-Notizen + explicit Fälligkeit for the demo window (the
  // einstellungen-beitraege plate shows the MV-Notizen). cents stays 69,69 €.
  const satzRows: Array<{ year: number; note: string }> = [
    { year: 2026, note: "MV 14.03.2026, TOP 7" },
    { year: 2025, note: "MV 15.03.2025, TOP 5" },
    { year: 2024, note: "MV 16.03.2024, TOP 6" },
  ];
  for (const s of satzRows) {
    await db
      .insert(schema.beitragssatzByYear)
      .values({
        year: s.year,
        cents: REGELBEITRAG_CENTS,
        faelligkeitAt: `${s.year}-03-31`,
        decisionNote: s.note,
      })
      .onConflictDoUpdate({
        target: schema.beitragssatzByYear.year,
        set: {
          cents: REGELBEITRAG_CENTS,
          faelligkeitAt: `${s.year}-03-31`,
          decisionNote: s.note,
          updatedAt: new Date(),
        },
      });
  }

  // Resolve the roster members that carry a Beitrags-Row.
  const emails = [...new Set(BEITRAG_ROWS.map((b) => b.memberEmail))];
  const memberIdByEmail = new Map<string, string>();
  if (emails.length > 0) {
    const rows = await db
      .select({
        id: schema.members.id,
        emailCanonical: schema.members.emailCanonical,
      })
      .from(schema.members)
      .where(
        and(
          eq(schema.members.isFixture, true),
          inArray(
            schema.members.emailCanonical,
            emails.map((e) => canonicalizeEmail(e)),
          ),
        ),
      );
    for (const r of rows) {
      if (r.emailCanonical) memberIdByEmail.set(r.emailCanonical, r.id);
    }
  }

  for (const b of BEITRAG_ROWS) {
    const memberId = memberIdByEmail.get(canonicalizeEmail(b.memberEmail));
    if (!memberId) {
      throw new Error(`seedBeitraege: roster member missing: ${b.memberEmail}`);
    }
    await db
      .insert(schema.memberBeitrags)
      .values({
        memberId,
        year: b.year,
        betragCents: REGELBEITRAG_CENTS,
        paidCents: b.paidCents,
        gezahltAm: b.gezahltAm,
        notes: b.notes ?? null,
        source: "fixture",
      })
      .onConflictDoNothing();
  }
}

// ---------------------------------------------------------------------------
// Showcase transaction corpus (Task 11, spec §4.7)
// ---------------------------------------------------------------------------
//
// A MODEST, constraint-satisfying set of expenses / income / donations (plus
// one paid-invoice→income link and a couple of Belegprüfung submissions) so
// the three transaction tabs render against realistic data before the Phase-6
// importer ingests the real legacy rows.
//
// HARD INVARIANTS (every row MUST satisfy these or the seed — and therefore
// EVERY DB test in the repo — fails on reset):
//   - kategorie_id NOT NULL on expenses/income/donations: we resolve it by
//     looking the real seeded kategorie up BY NAME, and copy its sphere into
//     sphere_snapshot (never hardcoded — always read from the row).
//   - expenses_beleg_or_grund_ck: every corpus expense carries a
//     belegVerzichtGrund and NO belegFileId (no real file blobs are seeded;
//     the §4.7 "Beleg liegt vor" cases are described, not uploaded).
//   - donations_zweckbindung_text_ck: the zweckgebundene Spende carries
//     zweckbindungText.
//   - donations_sachspende_wertermittlung_ck: the Sachspende carries both
//     wertermittlungMethode and zustandBeschreibung.
//
// Idempotency: every row uses a fixed `*-9xx` businessId reserved for fixtures
// and inserts with onConflictDoNothing({ target: <table>.businessId }).
// (`allocateBusinessId` uses the global getDb() handle, not the `db` passed to
// the seed, so we use reserved fixed ids here instead.)
//
// Festschreibung: 2024 rows set festgeschriebenAt AS AN INSERT COLUMN VALUE —
// the Festschreibung trigger blocks UPDATEs to festgeschrieben rows, so we
// never UPDATE after insert.

// No `Date.now()` — explicit ISO timestamps across 2024 / 2025 / 2026.
const T2024 = "2024-05-15T10:00:00Z";
const T2024_OLD = "2024-02-03T09:00:00Z"; // festgeschrieben 2024 row
// Aged (early-2025, NOT festgeschrieben) member Auslage still awaiting
// reimbursement — drives the aged "offen zu erstatten" pill correctly.
const T2025_EARLY = "2025-01-20T09:00:00Z";
const T2025 = "2025-07-20T12:00:00Z";
const T2026 = "2026-03-10T14:30:00Z";

const BELEG_VERZICHT = "Beleg liegt im Ordner — Demo-Daten";

type ExpenseFixture = {
  businessId: string;
  bezeichnung: string;
  /** kategorie name to look up under kind='expense'. */
  kategorieName: string;
  betragCents: bigint;
  gebuchtAm: string;
  status: (typeof schema.expenses.$inferInsert)["status"];
  /**
   * bezahlt_von discriminator. Verein-typical costs (Miete, GEMA, Technik) are
   * paid by the Verein; member-typical Auslagen (Fahrtkosten, Honorar fronted
   * by a member) are 'member' and carry a real fixture member's id — these are
   * the rows that drive the "offen zu erstatten" reimbursement UX.
   */
  bezahltVon: { kind: "verein" } | { kind: "member"; memberEmail: string };
  /** 2024 rows are festgeschrieben at insert time. */
  festgeschriebenAt?: string;
  /** Approval timestamp — set on geprueft/erstattet member Auslagen. */
  approvedAt?: string;
  erstattetAm?: string;
  /** Zahlungsart label for the reimbursement transfer (erstattet rows). */
  zahlungsartLabel?: string;
  rejectedReason?: string;
  kommentar?: string;
};

const EXPENSE_FIXTURES: ExpenseFixture[] = [
  // ideeller — Verein-paid
  {
    businessId: "A-2024-901",
    bezeichnung: "Kontoführung Q1 2024",
    kategorieName: "Bankgebühren",
    betragCents: 1290n,
    gebuchtAm: T2024,
    status: "erstattet",
    erstattetAm: "2024-06-01",
    bezahltVon: { kind: "verein" },
    festgeschriebenAt: T2024,
  },
  // zweckbetrieb — Verein-paid, festgeschrieben 2024
  {
    businessId: "A-2024-902",
    bezeichnung: "Saalmiete Probenwochenende",
    kategorieName: "Miete Location",
    betragCents: 85000n,
    gebuchtAm: T2024_OLD,
    status: "geprueft",
    bezahltVon: { kind: "verein" },
    festgeschriebenAt: T2024_OLD,
  },
  // zweckbetrieb — Verein-paid
  {
    businessId: "A-2025-903",
    bezeichnung: "GEMA-Abgabe Sommerfest",
    kategorieName: "GEMA / Abgaben",
    betragCents: 24050n,
    gebuchtAm: T2025,
    status: "geprueft",
    bezahltVon: { kind: "verein" },
  },
  // zweckbetrieb — MEMBER-paid, reimbursed (approved + erstattet + Zahlungsart).
  {
    businessId: "A-2025-904",
    bezeichnung: "Honorar DJ-Set (von Anna ausgelegt)",
    kategorieName: "Honorar Künstler:innen",
    betragCents: 50000n,
    gebuchtAm: T2025,
    status: "erstattet",
    bezahltVon: { kind: "member", memberEmail: "anna.mueller@example.de" },
    approvedAt: "2025-07-25T10:00:00Z",
    erstattetAm: "2025-08-05",
    zahlungsartLabel: "Banküberweisung",
  },
  // zweckbetrieb — MEMBER-paid, AGED + approved but NOT yet reimbursed →
  // genuine "offen zu erstatten" (Felix is owed money). Drives the aged-open
  // pill. NOT festgeschrieben (early-2025), so it can still be reimbursed.
  {
    businessId: "A-2025-905",
    bezeichnung: "Bahnfahrt Künstler:in München (von Felix ausgelegt)",
    kategorieName: "Fahrtkosten (Artists)",
    betragCents: 6780n,
    gebuchtAm: T2025_EARLY,
    status: "geprueft",
    bezahltVon: { kind: "member", memberEmail: "felix.bauer@example.de" },
    approvedAt: "2025-01-25T10:00:00Z",
    kommentar: "Alt-offener Posten — Felix wartet auf Erstattung.",
  },
  // zweckbetrieb — MEMBER-paid, direct admin-rejected (distinct from a rejected
  // auslagen_submission; this is the row the corpus test's `abgelehnt`
  // assertion checks).
  {
    businessId: "A-2025-906",
    bezeichnung: "Catering Crew (doppelt eingereicht)",
    kategorieName: "Verpflegung (Event)",
    betragCents: 13400n,
    gebuchtAm: T2025,
    status: "abgelehnt",
    rejectedReason:
      "Doppelte Einreichung — bereits über A-2025-904 abgerechnet.",
    bezahltVon: { kind: "member", memberEmail: "jonas.koehler@example.de" },
  },
  // zweckbetrieb — Verein-paid
  {
    businessId: "A-2026-907",
    bezeichnung: "Lichtanlage-Miete",
    kategorieName: "Technik-Miete/-Kauf",
    betragCents: 42000n,
    gebuchtAm: T2026,
    status: "zu_pruefen",
    bezahltVon: { kind: "verein" },
  },
  // zweckbetrieb — Verein-paid
  {
    businessId: "A-2026-908",
    bezeichnung: "Anfahrt Eventtag",
    kategorieName: "Fahrtkosten (Event)",
    betragCents: 9900n,
    gebuchtAm: T2026,
    status: "geprueft",
    bezahltVon: { kind: "verein" },
  },
  // wirtschaftlich — Verein-paid
  {
    businessId: "A-2026-909",
    bezeichnung: "Merch-Druck Shirts",
    kategorieName: "Merch-Einkauf / -Produktion",
    betragCents: 31500n,
    gebuchtAm: T2026,
    status: "geprueft",
    bezahltVon: { kind: "verein" },
  },
  // ideeller — Verein-paid
  {
    businessId: "A-2026-910",
    bezeichnung: "Software-Abo Buchhaltung",
    kategorieName: "Software / Abos",
    betragCents: 1190n,
    gebuchtAm: T2026,
    status: "zu_pruefen",
    bezahltVon: { kind: "verein" },
  },
];

type IncomeFixture = {
  businessId: string;
  bezeichnung: string;
  kategorieName: string;
  betragCents: bigint;
  gebuchtAm: string;
  festgeschriebenAt?: string;
  /** Marks the row the paid invoice links to via paid_by_income_id. */
  isInvoicePayment?: boolean;
};

const INCOME_FIXTURES: IncomeFixture[] = [
  // ideeller
  {
    businessId: "E-2024-901",
    bezeichnung: "Öffentlicher Zuschuss 2024",
    kategorieName: "Zuschuss (zweckgebunden)",
    betragCents: 250000n,
    gebuchtAm: T2024,
    festgeschriebenAt: T2024,
  },
  // vermoegen
  {
    businessId: "E-2024-902",
    bezeichnung: "Habenzinsen Tagesgeld 2024",
    kategorieName: "Zinsen",
    betragCents: 1830n,
    gebuchtAm: T2024,
    festgeschriebenAt: T2024,
  },
  // zweckbetrieb
  {
    businessId: "E-2025-903",
    bezeichnung: "Ticketverkauf Sommerfest",
    kategorieName: "Eintritt",
    betragCents: 145000n,
    gebuchtAm: T2025,
  },
  {
    businessId: "E-2025-904",
    bezeichnung: "Workshop-Gebühren Tanzkurs",
    kategorieName: "Workshop / Kursgebühr",
    betragCents: 36000n,
    gebuchtAm: T2025,
  },
  // zweckbetrieb — this row is the paid invoice's matching income receipt: the
  // payment of the canonical FDW-2026-001 (Cremosa · Catering Frühlingsfest).
  {
    businessId: "E-2026-905",
    bezeichnung: "Catering Frühlingsfest (Rechnung FDW-2026-001)",
    kategorieName: "Sonstige Einnahme (Zweckbetrieb)",
    betragCents: 6000n,
    gebuchtAm: T2026,
    isInvoicePayment: true,
  },
  // wirtschaftlich
  {
    businessId: "E-2026-906",
    bezeichnung: "Bar-Umsatz Eventabend",
    kategorieName: "Bar-Umsatz",
    betragCents: 87650n,
    gebuchtAm: T2026,
  },
  {
    businessId: "E-2026-907",
    bezeichnung: "Merch-Verkauf Eventabend",
    kategorieName: "Merch-Verkauf",
    betragCents: 42300n,
    gebuchtAm: T2026,
  },
  // ideeller — second ideeller row for breadth
  {
    businessId: "E-2026-908",
    bezeichnung: "Sonstige ideelle Einnahme",
    kategorieName: "Sonstige Einnahme (Ideell)",
    betragCents: 5000n,
    gebuchtAm: T2026,
  },
];

// ---------------------------------------------------------------------------
// Ausgangsrechnungen — the FDW-2026 canon (spec §3 / FIXTURES §7 + §13a).
//
// Six issued invoices so the /app/rechnungen list, detail and kunde-detail
// Rechnungen-Tab render the real "270,00 € offen" world:
//   001–003 bezahlt · 004 überfällig · 005/006 offen
//   → offen 120 + 90 + 60 = 270,00 € · 3 Rechnungen; nächste Nr. FDW-2026-007
//     (the id_counter seeds from MAX(seq)+1, so the canon MUST end at 006).
//   Maria Huber: 003 (20,00 bezahlt) + 006 (60,00 offen) → offen 60,00 €.
//
// FDW-2026-001 is the single invoice→income link (paid_by_income_id →
// E-2026-905, P47-05 / spec §4.7); the other two paid invoices carry no
// income link (no CHECK couples bezahlt_am to paid_by_income_id).
// §19 UStG: brutto = netto, ust = 0. All kategorien are income kategorien.
type InvoiceFixture = {
  businessId: string;
  /** Resolved to customer id + address snapshot at insert time. */
  customerName: string;
  bezeichnung: string;
  /** Income kategorie (Einnahme); resolved by name. */
  kategorieName: string;
  /** netto == brutto (§19). */
  nettoCents: bigint;
  rechnungsdatum: string;
  leistungszeitraum: string;
  /** Set → the invoice can be überfällig (faelligkeits_datum < heute). */
  faelligkeitsDatum?: string;
  /** Set → the invoice is bezahlt. */
  bezahltAm?: string;
  /** true → links paid_by_income_id to the isInvoicePayment row (E-2026-905). */
  linksPaymentIncome?: boolean;
};

const INVOICE_FIXTURES: InvoiceFixture[] = [
  {
    businessId: "FDW-2026-001",
    customerName: "Cremosa GmbH",
    bezeichnung: "Catering Frühlingsfest",
    kategorieName: "Sonstige Einnahme (Zweckbetrieb)",
    nettoCents: 6000n,
    rechnungsdatum: "2026-04-28",
    leistungszeitraum: "April 2026",
    bezahltAm: "2026-05-02",
    linksPaymentIncome: true,
  },
  {
    businessId: "FDW-2026-002",
    customerName: "Cremosa GmbH",
    bezeichnung: "Nachbestellung Frühlingsfest",
    kategorieName: "Sonstige Einnahme (Zweckbetrieb)",
    nettoCents: 4000n,
    rechnungsdatum: "2026-05-04",
    leistungszeitraum: "Mai 2026",
    bezahltAm: "2026-05-12",
  },
  {
    businessId: "FDW-2026-003",
    customerName: "Maria Huber",
    bezeichnung: "Kursgebühr Töpfern",
    kategorieName: "Workshop / Kursgebühr",
    nettoCents: 2000n,
    rechnungsdatum: "2026-05-12",
    leistungszeitraum: "Mai 2026",
    bezahltAm: "2026-05-20",
  },
  {
    businessId: "FDW-2026-004",
    customerName: "Kulturkreis Pankow e.V.",
    bezeichnung: "Workshop „Klang & Bewegung“",
    kategorieName: "Workshop / Kursgebühr",
    nettoCents: 12000n,
    rechnungsdatum: "2026-06-05",
    leistungszeitraum: "Mai 2026",
    // fällig in der Vergangenheit → überfällig (der eine amber-Fall der Liste).
    faelligkeitsDatum: "2026-07-06",
  },
  {
    businessId: "FDW-2026-005",
    customerName: "Musikschule Klangraum",
    bezeichnung: "Standmiete Sommerfest",
    kategorieName: "Sonstige Einnahme (Zweckbetrieb)",
    nettoCents: 9000n,
    rechnungsdatum: "2026-06-20",
    leistungszeitraum: "Juni 2026",
    // kein Fälligkeitsdatum → bleibt „offen“, wird nie „überfällig“.
  },
  {
    businessId: "FDW-2026-006",
    customerName: "Maria Huber",
    bezeichnung: "Kursgebühr Aquarell",
    kategorieName: "Workshop / Kursgebühr",
    nettoCents: 6000n,
    rechnungsdatum: "2026-06-30",
    leistungszeitraum: "Juni 2026",
  },
];

/**
 * Resolves seeded kategorien by (kind, name) into a name→{id, sphere} map.
 * Throws if any requested kategorie is missing — a missing kategorie means the
 * reference seed and this corpus drifted and we'd otherwise insert a row with a
 * wrong/NULL kategorie_id.
 */
async function resolveKategorien(
  db: Db,
  kind: "expense" | "income",
  names: string[],
): Promise<Map<string, { id: string; sphere: Sphere }>> {
  const rows = await db
    .select({
      name: schema.kategorien.name,
      id: schema.kategorien.id,
      sphere: schema.kategorien.sphere,
    })
    .from(schema.kategorien)
    .where(
      and(
        eq(schema.kategorien.kind, kind),
        inArray(schema.kategorien.name, names),
      ),
    );
  const map = new Map<string, { id: string; sphere: Sphere }>();
  for (const r of rows) {
    map.set(r.name, { id: r.id, sphere: r.sphere });
  }
  const missing = names.filter((n) => !map.has(n));
  if (missing.length > 0) {
    throw new Error(
      `seedTransactionCorpus: kategorien missing for kind=${kind}: ${missing.join(", ")}`,
    );
  }
  return map;
}

/**
 * Resolves seeded fixture members by canonical email into
 * email→{id, displayName}. Throws if any requested member is missing — a
 * member-paid expense whose member can't be found would otherwise violate
 * expenses_bezahlt_von_union_ck (member kind needs a non-null member id).
 */
async function resolveMembers(
  db: Db,
  emails: string[],
): Promise<Map<string, { id: string; displayName: string }>> {
  const canon = emails.map((e) => canonicalizeEmail(e));
  const rows = await db
    .select({
      id: schema.members.id,
      emailCanonical: schema.members.emailCanonical,
      vorname: schema.members.vorname,
      nachname: schema.members.nachname,
    })
    .from(schema.members)
    .where(
      and(
        eq(schema.members.isFixture, true),
        inArray(schema.members.emailCanonical, canon),
      ),
    );
  const map = new Map<string, { id: string; displayName: string }>();
  for (const r of rows) {
    map.set(r.emailCanonical!, {
      id: r.id,
      displayName: `${r.vorname} ${r.nachname}`,
    });
  }
  const missing = emails.filter((e) => !map.has(canonicalizeEmail(e)));
  if (missing.length > 0) {
    throw new Error(
      `seedTransactionCorpus: fixture members missing: ${missing.join(", ")}`,
    );
  }
  return map;
}

export async function seedTransactionCorpus(db: Db): Promise<void> {
  console.log("seed-fixtures: transaction corpus …");

  // --- Expenses ---
  const expenseCats = await resolveKategorien(
    db,
    "expense",
    EXPENSE_FIXTURES.map((e) => e.kategorieName),
  );
  // Real fixture members fronting member-paid Auslagen.
  const memberEmails = EXPENSE_FIXTURES.flatMap((e) =>
    e.bezahltVon.kind === "member" ? [e.bezahltVon.memberEmail] : [],
  );
  const members =
    memberEmails.length > 0
      ? await resolveMembers(db, memberEmails)
      : new Map<string, { id: string; displayName: string }>();
  // Zahlungsart for reimbursement transfers (resolved by label).
  const zahlungsartLabels = [
    ...new Set(
      EXPENSE_FIXTURES.flatMap((e) =>
        e.zahlungsartLabel ? [e.zahlungsartLabel] : [],
      ),
    ),
  ];
  const zahlungsarten = new Map<string, string>();
  for (const label of zahlungsartLabels) {
    const [row] = await db
      .select({ id: schema.zahlungsarten.id })
      .from(schema.zahlungsarten)
      .where(eq(schema.zahlungsarten.label, label))
      .limit(1);
    if (!row) {
      throw new Error(`seedTransactionCorpus: zahlungsart missing: ${label}`);
    }
    zahlungsarten.set(label, row.id);
  }

  for (const e of EXPENSE_FIXTURES) {
    const kat = expenseCats.get(e.kategorieName)!;
    const member =
      e.bezahltVon.kind === "member"
        ? members.get(canonicalizeEmail(e.bezahltVon.memberEmail))!
        : null;
    await db
      .insert(schema.expenses)
      .values({
        businessId: e.businessId,
        source: "fixture",
        gebuchtAm: new Date(e.gebuchtAm),
        betragCents: e.betragCents,
        bezeichnung: e.bezeichnung,
        kommentar: e.kommentar ?? null,
        kategorieId: kat.id,
        kategorieNameSnapshot: e.kategorieName,
        sphereSnapshot: kat.sphere,
        // bezahlt_von discriminated union (expenses_bezahlt_von_union_ck):
        // member → member id set + extern fields null; verein → all null.
        bezahltVonKind: e.bezahltVon.kind,
        bezahltVonMemberId: member?.id ?? null,
        bezahltVonDisplay: member ? member.displayName : "Verein",
        // expenses_beleg_or_grund_ck: Belegverzicht, no real file blob.
        belegVerzichtGrund: BELEG_VERZICHT,
        status: e.status,
        approvedAt: e.approvedAt ? new Date(e.approvedAt) : null,
        erstattetAm: e.erstattetAm ?? null,
        zahlungsartId: e.zahlungsartLabel
          ? (zahlungsarten.get(e.zahlungsartLabel) ?? null)
          : null,
        rejectedReason: e.rejectedReason ?? null,
        rejectedAt: e.status === "abgelehnt" ? new Date(e.gebuchtAm) : null,
        festgeschriebenAt: e.festgeschriebenAt
          ? new Date(e.festgeschriebenAt)
          : null,
      })
      .onConflictDoNothing({ target: schema.expenses.businessId });
  }

  // --- Income ---
  const incomeCats = await resolveKategorien(
    db,
    "income",
    INCOME_FIXTURES.map((i) => i.kategorieName),
  );
  // Track the income row the paid invoice links to.
  let invoicePaymentIncomeId: string | null = null;
  for (const i of INCOME_FIXTURES) {
    const kat = incomeCats.get(i.kategorieName)!;
    const [row] = await db
      .insert(schema.income)
      .values({
        businessId: i.businessId,
        source: "fixture",
        gebuchtAm: new Date(i.gebuchtAm),
        betragCents: i.betragCents,
        bezeichnung: i.bezeichnung,
        kategorieId: kat.id,
        kategorieNameSnapshot: i.kategorieName,
        sphereSnapshot: kat.sphere,
        festgeschriebenAt: i.festgeschriebenAt
          ? new Date(i.festgeschriebenAt)
          : null,
      })
      .onConflictDoNothing({ target: schema.income.businessId })
      .returning({ id: schema.income.id });
    if (i.isInvoicePayment && row) invoicePaymentIncomeId = row.id;
  }
  // If the invoice-payment income row already existed (re-seed), look it up.
  if (invoicePaymentIncomeId === null) {
    const [existing] = await db
      .select({ id: schema.income.id })
      .from(schema.income)
      .where(eq(schema.income.businessId, "E-2026-905"))
      .limit(1);
    invoicePaymentIncomeId = existing?.id ?? null;
  }

  // --- Donations (>=2 years; geld + sach) ---
  // Donation kategorien live under kind='income' (the derivation cats).
  const donationCats = await resolveKategorien(db, "income", [
    "Geldspende zweckfrei",
    "Geldspende zweckgebunden",
    "Sachspende",
  ]);
  // Geldspende zweckfrei (2024, festgeschrieben, with Bescheinigung).
  {
    const kat = donationCats.get("Geldspende zweckfrei")!;
    await db
      .insert(schema.donations)
      .values({
        businessId: "S-2024-901",
        source: "fixture",
        gebuchtAm: new Date(T2024),
        zugewendetAm: "2024-05-15",
        betragCents: 10000n,
        spenderName: "Bäckerei Maier GmbH",
        spendeKind: "geldspende",
        zweckbindungKind: "zweckfrei",
        kategorieId: kat.id,
        kategorieNameSnapshot: "Geldspende zweckfrei",
        sphereSnapshot: kat.sphere,
        bescheinigungNr: "B-2024-901",
        bescheinigungAusgestelltAm: "2024-06-01",
        bescheidTyp: "geldspende",
        festgeschriebenAt: new Date(T2024),
      })
      .onConflictDoNothing({ target: schema.donations.businessId });
  }
  // Geldspende zweckgebunden (2025, no Bescheinigung, zweckbindungText set →
  // satisfies donations_zweckbindung_text_ck).
  {
    const kat = donationCats.get("Geldspende zweckgebunden")!;
    await db
      .insert(schema.donations)
      .values({
        businessId: "S-2025-902",
        source: "fixture",
        gebuchtAm: new Date(T2025),
        zugewendetAm: "2025-07-20",
        betragCents: 50000n,
        spenderName: "Getränke Huber",
        spendeKind: "geldspende",
        zweckbindungKind: "zweckgebunden",
        zweckbindungText: "Zweckgebunden für die Nachwuchsförderung 2025.",
        kategorieId: kat.id,
        kategorieNameSnapshot: "Geldspende zweckgebunden",
        sphereSnapshot: kat.sphere,
      })
      .onConflictDoNothing({ target: schema.donations.businessId });
  }
  // Sachspende (2025; wertermittlungMethode + zustandBeschreibung set →
  // satisfies donations_sachspende_wertermittlung_ck).
  {
    const kat = donationCats.get("Sachspende")!;
    await db
      .insert(schema.donations)
      .values({
        businessId: "S-2025-903",
        source: "fixture",
        gebuchtAm: new Date(T2025),
        zugewendetAm: "2025-09-01",
        betragCents: 80000n,
        spenderName: "Sporthaus Vogl",
        spendeKind: "sachspende",
        zweckbindungKind: "zweckfrei",
        kategorieId: kat.id,
        kategorieNameSnapshot: "Sachspende",
        sphereSnapshot: kat.sphere,
        wertermittlungMethode: "kaufbeleg",
        zustandBeschreibung:
          "Gebrauchter PA-Lautsprecher, voll funktionsfähig.",
      })
      .onConflictDoNothing({ target: schema.donations.businessId });
  }

  // --- Ausgangsrechnungen (Kanon FDW-2026-001…006, spec §3 / FIXTURES §7) ---
  // 001–003 bezahlt · 004 überfällig · 005/006 offen → offen 270,00 € · 3;
  // nächste Nr. FDW-2026-007. FDW-2026-001 carries the one invoice→income link
  // (paid_by_income_id → E-2026-905, P47-05). invoices.pdf_file_id is left
  // NULL — no blob is seeded (PDFs are produced by the create flow).
  {
    const invoiceCustomerNames = [
      ...new Set(INVOICE_FIXTURES.map((i) => i.customerName)),
    ];
    const customerRows = await db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        addressBlock: schema.customers.addressBlock,
      })
      .from(schema.customers)
      .where(
        and(
          inArray(schema.customers.name, invoiceCustomerNames),
          eq(schema.customers.isFixture, true),
        ),
      );
    const customerByName = new Map(customerRows.map((c) => [c.name, c]));
    const invoiceCats = await resolveKategorien(
      db,
      "income",
      INVOICE_FIXTURES.map((i) => i.kategorieName),
    );

    for (const inv of INVOICE_FIXTURES) {
      const customer = customerByName.get(inv.customerName);
      if (!customer) continue; // customer seed drifted — guarded by tests
      const kat = invoiceCats.get(inv.kategorieName)!;
      // created_at ascends with the number so the list (ORDER BY created_at
      // DESC) renders newest-first (006 → 001), matching the plate.
      const stamp = new Date(`${inv.rechnungsdatum}T10:00:00Z`);
      await db
        .insert(schema.invoices)
        .values({
          businessId: inv.businessId,
          source: "fixture",
          gebuchtAm: stamp,
          createdAt: stamp,
          rechnungsdatum: inv.rechnungsdatum,
          faelligkeitsDatum: inv.faelligkeitsDatum ?? null,
          customerId: customer.id,
          customerNameSnapshot: customer.name,
          customerAddressSnapshot: customer.addressBlock,
          nettoCents: inv.nettoCents,
          ustCents: 0n,
          bruttoCents: inv.nettoCents,
          kategorieId: kat.id,
          kategorieNameSnapshot: inv.kategorieName,
          sphereSnapshot: kat.sphere,
          bezeichnung: inv.bezeichnung,
          leistungszeitraum: inv.leistungszeitraum,
          paidByIncomeId: inv.linksPaymentIncome
            ? invoicePaymentIncomeId
            : null,
          bezahltAm: inv.bezahltAm ?? null,
        })
        .onConflictDoNothing({ target: schema.invoices.businessId });
    }

    // Advance the FDW/2026 id_counter past the seeded canon so the next
    // app-issued invoice is FDW-2026-007 (spec §3), not a collision at 001.
    // Unlike the -9xx corpus fixtures, this canon uses the low 001–006 range
    // that fresh allocation would otherwise re-issue. seed_id_counter_from_corpus
    // sets next_value = MAX(seq)+1 = 7 and is idempotent (GREATEST on conflict).
    await db.execute(sql`SELECT seed_id_counter_from_corpus(2026, 'FDW')`);
  }

  // --- Belegprüfung submissions (>=1 pending, >=1 rejected) ---
  // Public-form Auslage submissions for the audit inbox. Pending = decidedAt
  // NULL; rejected = decision='rejected'. consentTextVersion is NOT NULL.
  await db
    .insert(schema.auslagenSubmissions)
    .values([
      {
        businessId: "AUS-2026-901",
        bezeichnung: "Spontankauf Kabel (offen im Inbox)",
        wofuer: "Verlängerungskabel für Bühnentechnik",
        betragCents: 2499n,
        bezahltVonKind: "extern",
        externName: "Helfer:in extern",
        bezahltVonDisplay: "Extern: Helfer:in",
        consentTextVersion: DATENSCHUTZ_VERSION,
        // auslagen_submissions_beleg_or_grund_ck (migration 0036): no blob
        // uploaded in fixtures, so use the Verzicht arm.
        belegVerzichtGrund: "Quittung nicht mehr auffindbar (Fixture-Eintrag)",
        // decidedAt NULL → open/pending in the inbox.
      },
      {
        businessId: "AUS-2026-902",
        bezeichnung: "Privater Snack-Einkauf (abgelehnt)",
        wofuer: "Snacks für privaten Bedarf",
        betragCents: 1850n,
        bezahltVonKind: "extern",
        externName: "Gast",
        bezahltVonDisplay: "Extern: Gast",
        consentTextVersion: DATENSCHUTZ_VERSION,
        // auslagen_submissions_beleg_or_grund_ck: Verzicht arm for fixtures.
        belegVerzichtGrund: "Kein Beleg vorhanden (Fixture-Eintrag)",
        decidedAt: new Date(T2026),
        decision: "rejected",
        decisionReason: "Kein vereinsbezogener Beleg.",
      },
    ])
    .onConflictDoNothing({ target: schema.auslagenSubmissions.businessId });
}

// Allow direct invocation: `pnpm tsx scripts/seed-fixtures.ts` (rarely used —
// usually called by scripts/seed.ts after reference data is in place).
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    console.error("ERROR: DIRECT_DATABASE_URL (or DATABASE_URL) is required.");
    process.exit(1);
  }
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;
  const client: Client = postgres(url, { prepare: false, max: 1 });
  try {
    const db = drizzle(client, { schema });
    await seedFixtures(db);
  } finally {
    await client.end();
  }
}
