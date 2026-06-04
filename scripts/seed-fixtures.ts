/**
 * Fixture-only seed — 5 fake Mitglieder, 2 Projects, 2 Customers, all
 * `is_fixture=true` so Phases 2-5 have something to develop against before
 * the Phase 6 importer ingests the real legacy data.
 *
 * Idempotency: keyed on natural identifiers via existence-check (members'
 * email_canonical and customers' name aren't UNIQUE in the schema; we look
 * them up before INSERT instead of relying on ON CONFLICT). Projects have
 * UNIQUE(business_id) so ON CONFLICT works directly there.
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

const MEMBERS = [
  {
    vorname: "Maria",
    nachname: "Müller",
    email: "maria.mueller@example.org",
    role: "vorstand" as const,
  },
  {
    vorname: "Jonas",
    nachname: "Schäfer",
    email: "jonas.schaefer@example.org",
    role: "kassenwart" as const,
  },
  {
    vorname: "Lara",
    nachname: "Köhler",
    email: "lara.koehler@example.org",
    role: "mitglied" as const,
  },
  {
    vorname: "Felix",
    nachname: "Bauer",
    email: "felix.bauer@example.org",
    role: "mitglied" as const,
  },
  {
    vorname: "Sina",
    nachname: "Hofmann",
    email: "sina.hofmann@example.org",
    role: "fördermitglied" as const,
  },
];

const PROJECTS = [
  {
    businessId: "P-2026-001",
    name: "Folge der Wolke — Wochenende 2026",
    sphereDefault: "zweckbetrieb" as const,
  },
  {
    businessId: "P-2026-002",
    name: "Bar-Pop-up Sommer 2026",
    sphereDefault: "wirtschaftlich" as const,
  },
];

const CUSTOMERS = [
  {
    name: "Beispiel GmbH",
    anrede: "Sehr geehrte Damen und Herren",
    addressBlock: "Beispiel GmbH\nMusterstr. 1\n80331 München",
  },
  {
    name: "Antonia Beispiel",
    anrede: "Liebe Antonia",
    addressBlock: "Antonia Beispiel\nBeispielweg 2\n80339 München",
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
        sphereDefault: p.sphereDefault,
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
      isFixture: true,
    });
  }

  // Transaction corpus — depends on kategorien (reference data) + the
  // members/projects/customers fixtures seeded above.
  await seedTransactionCorpus(db);
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
const T2024_OLD = "2024-02-03T09:00:00Z"; // aged-open pill driver (geprueft)
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
  bezahltVonDisplay: string;
  /** 2024 rows are festgeschrieben at insert time. */
  festgeschriebenAt?: string;
  erstattetAm?: string;
  rejectedReason?: string;
  kommentar?: string;
};

const EXPENSE_FIXTURES: ExpenseFixture[] = [
  // ideeller
  {
    businessId: "A-2024-901",
    bezeichnung: "Kontoführung Q1 2024",
    kategorieName: "Bankgebühren",
    betragCents: 1290n,
    gebuchtAm: T2024,
    status: "erstattet",
    erstattetAm: "2024-06-01",
    bezahltVonDisplay: "Verein",
    festgeschriebenAt: T2024,
  },
  // zweckbetrieb — aged-open geprueft (2024_OLD) to drive the aged-open pill
  {
    businessId: "A-2024-902",
    bezeichnung: "Saalmiete Probenwochenende",
    kategorieName: "Miete Location",
    betragCents: 85000n,
    gebuchtAm: T2024_OLD,
    status: "geprueft",
    bezahltVonDisplay: "Verein",
    festgeschriebenAt: T2024_OLD,
    kommentar: "Alt-offener Posten — treibt die Aged-Open-Pill.",
  },
  // zweckbetrieb
  {
    businessId: "A-2025-903",
    bezeichnung: "GEMA-Abgabe Sommerfest",
    kategorieName: "GEMA / Abgaben",
    betragCents: 24050n,
    gebuchtAm: T2025,
    status: "geprueft",
    bezahltVonDisplay: "Verein",
  },
  {
    businessId: "A-2025-904",
    bezeichnung: "Honorar DJ-Set",
    kategorieName: "Honorar Künstler:innen",
    betragCents: 50000n,
    gebuchtAm: T2025,
    status: "erstattet",
    erstattetAm: "2025-08-05",
    bezahltVonDisplay: "Maria M.",
  },
  {
    businessId: "A-2025-905",
    bezeichnung: "Bahnfahrt Künstler:in München",
    kategorieName: "Fahrtkosten (Artists)",
    betragCents: 6780n,
    gebuchtAm: T2025,
    status: "erstattet",
    erstattetAm: "2025-08-05",
    bezahltVonDisplay: "Felix B.",
  },
  // zweckbetrieb — direct admin-rejected expense (distinct from a rejected
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
    bezahltVonDisplay: "Lara K.",
  },
  {
    businessId: "A-2026-907",
    bezeichnung: "Lichtanlage-Miete",
    kategorieName: "Technik-Miete/-Kauf",
    betragCents: 42000n,
    gebuchtAm: T2026,
    status: "zu_pruefen",
    bezahltVonDisplay: "Verein",
  },
  {
    businessId: "A-2026-908",
    bezeichnung: "Anfahrt Eventtag",
    kategorieName: "Fahrtkosten (Event)",
    betragCents: 9900n,
    gebuchtAm: T2026,
    status: "geprueft",
    bezahltVonDisplay: "Verein",
  },
  // wirtschaftlich
  {
    businessId: "A-2026-909",
    bezeichnung: "Merch-Druck Shirts",
    kategorieName: "Merch-Einkauf / -Produktion",
    betragCents: 31500n,
    gebuchtAm: T2026,
    status: "geprueft",
    bezahltVonDisplay: "Verein",
  },
  {
    businessId: "A-2026-910",
    bezeichnung: "Software-Abo Buchhaltung",
    kategorieName: "Software / Abos",
    betragCents: 1190n,
    gebuchtAm: T2026,
    status: "zu_pruefen",
    bezahltVonDisplay: "Verein",
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
    bezeichnung: "Projektzuschuss Stadt 2024",
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

export async function seedTransactionCorpus(db: Db): Promise<void> {
  console.log("seed-fixtures: transaction corpus …");

  // --- Expenses ---
  const expenseCats = await resolveKategorien(
    db,
    "expense",
    EXPENSE_FIXTURES.map((e) => e.kategorieName),
  );
  for (const e of EXPENSE_FIXTURES) {
    const kat = expenseCats.get(e.kategorieName)!;
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
        bezahltVonKind: "verein",
        bezahltVonDisplay: e.bezahltVonDisplay,
        // expenses_beleg_or_grund_ck: Belegverzicht, no real file blob.
        belegVerzichtGrund: BELEG_VERZICHT,
        status: e.status,
        erstattetAm: e.erstattetAm ?? null,
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
        spenderName: "Anonyme Spenderin",
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
        spenderName: "Förderkreis e.V.",
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
        spenderName: "Technik Müller GmbH",
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
          eq(schema.customers.name, "Beispiel GmbH"),
          eq(schema.customers.isFixture, true),
        ),
      )
      .limit(1);
    const invoiceKat = await resolveKategorien(db, "income", [
      "Honorar künstlerische Leistung",
    ]);
    const kat = invoiceKat.get("Honorar künstlerische Leistung")!;
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
