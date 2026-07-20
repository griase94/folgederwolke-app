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

import { and, eq, inArray } from "drizzle-orm";
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
  email: string;
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
    email: "anna.mueller@example.org",
    role: "mitglied",
    eintrittsDatum: "2020-05-01",
  },
  {
    vorname: "Lena",
    nachname: "Hofmann",
    email: "lena.hofmann@example.org",
    role: "vorstand", // Vorsitzende (FIXTURES §16b)
    eintrittsDatum: "2019-02-01",
  },
  {
    vorname: "Felix",
    nachname: "Bauer",
    email: "felix.bauer@example.org",
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
    email: "tim.schaefer@example.org",
    role: "mitglied", // offen 2026; 2025 teilbezahlt (30,00 / 69,69)
    eintrittsDatum: "2023-03-01",
  },
  {
    vorname: "Test",
    nachname: "User",
    email: "test.user@example.org",
    role: "mitglied", // ehrliche Test-Zeile — offen
    eintrittsDatum: "2024-01-15",
  },
  {
    vorname: "Renate",
    nachname: "Albrecht",
    email: "renate.albrecht@example.org",
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

// Kunden-Kast. Cremosa GmbH replaces the old "Beispiel GmbH" and is the
// customer the seeded paid invoice (FDW-2026-901) points at.
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
    const emailCanonical = canonicalizeEmail(m.email);
    const existing = await db
      .select({ id: schema.members.id })
      .from(schema.members)
      .where(
        and(
          eq(schema.members.emailCanonical, emailCanonical),
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
}

// ---------------------------------------------------------------------------
// Beitrags-Kanon (FIXTURES §13a / §16c)
// ---------------------------------------------------------------------------
//
// Per-year Beitragssatz (69,69 €, Fälligkeit 31.03.) for the trailing window
// 2024/2025/2026, plus member_beitrags rows so the roster reads its canonical
// states:
//   - Anna / Lena / Felix — bezahlt (2024–2026): the three "3 von 6 bezahlt"
//     payers; their 2026 paid rows sum to 209,07 €.
//   - Tim Schäfer — 2025 teilbezahlt (30,00 / 69,69), 2026 offen (no row).
//   - Jonas Köhler / Test User — offen/überfällig (no rows → satz-derived).
//   - Renate Albrecht — permanent befreit via members.beitrag_exempt (no rows).
//
// ANCHOR is the current year's Buchungsjahr window used by the demo plates.
// The Fälligkeit is the canonical 31.03.; whether an unpaid current-year cell
// reads "offen" or "überfällig" is derived honestly from today's date + grace.

type BeitragSeed = {
  memberEmail: string;
  year: number;
  paidCents: bigint;
  gezahltAm: string | null;
  notes?: string;
};

const BEITRAG_ROWS: BeitragSeed[] = [
  // Anna Müller — durchgängig bezahlt.
  {
    memberEmail: "anna.mueller@example.org",
    year: 2024,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2024-02-15",
  },
  {
    memberEmail: "anna.mueller@example.org",
    year: 2025,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2025-02-15",
  },
  {
    memberEmail: "anna.mueller@example.org",
    year: 2026,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2026-02-10",
  },
  // Lena Hofmann — durchgängig bezahlt.
  {
    memberEmail: "lena.hofmann@example.org",
    year: 2024,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2024-01-22",
  },
  {
    memberEmail: "lena.hofmann@example.org",
    year: 2025,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2025-01-20",
  },
  {
    memberEmail: "lena.hofmann@example.org",
    year: 2026,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2026-01-15",
  },
  // Felix Bauer — durchgängig bezahlt.
  {
    memberEmail: "felix.bauer@example.org",
    year: 2024,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2024-03-10",
  },
  {
    memberEmail: "felix.bauer@example.org",
    year: 2025,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2025-03-08",
  },
  {
    memberEmail: "felix.bauer@example.org",
    year: 2026,
    paidCents: REGELBEITRAG_CENTS,
    gezahltAm: "2026-03-05",
  },
  // Tim Schäfer — 2025 teilbezahlt (30,00 / 69,69). 2026 bleibt offen (no row).
  {
    memberEmail: "tim.schaefer@example.org",
    year: 2025,
    paidCents: 3000n,
    gezahltAm: "2025-04-10",
    notes: "Teilzahlung 30,00 € — Restbetrag 39,69 € offen",
  },
  // Jonas Köhler / Test User: intentionally NO rows → open/overdue via satz.
  // Renate Albrecht: permanent exempt via members.beitrag_exempt → NO rows.
];

async function seedBeitraege(db: Db): Promise<void> {
  console.log("seed-fixtures: beitragssätze + beitrags-rows …");

  // Per-year Beitragssatz (PK year → idempotent). decisionNote per FIXTURES §16c.
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
      .onConflictDoNothing({ target: schema.beitragssatzByYear.year });
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
    bezahltVon: { kind: "member", memberEmail: "anna.mueller@example.org" },
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
    bezahltVon: { kind: "member", memberEmail: "felix.bauer@example.org" },
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
  // zweckbetrieb — this row is the paid invoice's matching income receipt.
  {
    businessId: "E-2026-905",
    bezeichnung: "Honorar Auftragsproduktion (Rechnung FDW-2026-901)",
    kategorieName: "Honorar künstlerische Leistung",
    betragCents: 119000n,
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

  // --- Invoice → income link (P47-05, REQUIRED for Phase 5) ---
  // One paid Ausgangsrechnung whose paid_by_income_id points at the seeded
  // income receipt E-2026-905. invoices.pdf_file_id / kategorie_id are
  // nullable so no file blob is needed.
  {
    const [customer] = await db
      .select({ id: schema.customers.id, name: schema.customers.name })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.name, "Cremosa GmbH"),
          eq(schema.customers.isFixture, true),
        ),
      )
      .limit(1);
    // Reuse the already-resolved income kategorie (no extra round-trip).
    const kat = incomeCats.get("Honorar künstlerische Leistung")!;
    if (customer) {
      await db
        .insert(schema.invoices)
        .values({
          businessId: "FDW-2026-901",
          source: "fixture",
          gebuchtAm: new Date(T2026),
          rechnungsdatum: "2026-03-01",
          leistungsDatum: "2026-02-28",
          customerId: customer.id,
          customerNameSnapshot: customer.name,
          nettoCents: 119000n,
          ustCents: 0n,
          bruttoCents: 119000n,
          kategorieId: kat.id,
          kategorieNameSnapshot: "Honorar künstlerische Leistung",
          sphereSnapshot: kat.sphere,
          bezeichnung: "Auftragsproduktion Imagefilm",
          leistungszeitraum: "Februar 2026",
          // Payment reconciliation — the seeded income receipt.
          paidByIncomeId: invoicePaymentIncomeId,
          bezahltAm: "2026-03-10",
        })
        .onConflictDoNothing({ target: schema.invoices.businessId });
    }
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
