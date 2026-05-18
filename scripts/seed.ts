/**
 * Idempotent seed for Folge der Wolke e.V.
 *
 * Run: `pnpm tsx scripts/seed.ts`
 *
 * Inserts (or updates on conflict) the canonical reference data:
 *   - 35 Ausgaben kategorien (13 ideeller + 19 zweckbetrieb + 3 wirtschaftlich)
 *   - 15 Einnahmen kategorien
 *   - 6 zahlungsarten
 *   - settings: audit_chain_genesis_at, mail templates, Bankverbindung, etc.
 *
 * Calls `scripts/seed-fixtures.ts` last to install fake Mitglieder / Projects /
 * Customers (is_fixture=true) that Phases 2-5 develop against.
 *
 * Idempotency: every INSERT uses ON CONFLICT DO UPDATE on a natural key
 * (kategorien.kind+name, zahlungsarten.label, settings.key, ...).
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../src/lib/server/db/schema/index.js";
import { seedFixtures } from "./seed-fixtures.js";

// ---------------------------------------------------------------------------
// Reference data — copied from legacy `apps-script/config.ts`.
// ---------------------------------------------------------------------------

type KatRow = {
  name: string;
  sphere: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
  eurZeile?: number | null;
  anlageGemZeile?: number | null;
};

const AUSGABEN_KATEGORIEN: KatRow[] = [
  // --- 13 IDEELLER (Ideeller Bereich) ---
  { name: "Bankgebühren", sphere: "ideeller" },
  { name: "Beiträge / Mitgliedschaften (Dachverbände)", sphere: "ideeller" },
  { name: "Bürobedarf", sphere: "ideeller" },
  { name: "Fahrtkosten (Verein)", sphere: "ideeller" },
  { name: "Notar / Recht / Steuer", sphere: "ideeller" },
  { name: "Promo / Werbung (Verein)", sphere: "ideeller" },
  { name: "Sitzung/Tagung / Klausur", sphere: "ideeller" },
  { name: "Software / Abos", sphere: "ideeller" },
  { name: "Sonstige Ausgabe (Ideell)", sphere: "ideeller" },
  { name: "Übernachtung (Verein)", sphere: "ideeller" },
  { name: "Verpflegung (Verein)", sphere: "ideeller" },
  { name: "Versicherung", sphere: "ideeller" },
  { name: "Vorstandssitzung / Mitgliederversammlung", sphere: "ideeller" },

  // --- 19 ZWECKBETRIEB ---
  { name: "Bürokratie", sphere: "zweckbetrieb" },
  { name: "Deko / Material", sphere: "zweckbetrieb" },
  { name: "Fahrtkosten (Artists)", sphere: "zweckbetrieb" },
  { name: "Fahrtkosten (Event)", sphere: "zweckbetrieb" },
  { name: "Fahrzeug-Miete", sphere: "zweckbetrieb" },
  { name: "Foto / Video / Doku", sphere: "zweckbetrieb" },
  { name: "GEMA / Abgaben", sphere: "zweckbetrieb" },
  { name: "Honorar Künstler:innen", sphere: "zweckbetrieb" },
  { name: "Miete Location", sphere: "zweckbetrieb" },
  { name: "Promo / Werbung (Event)", sphere: "zweckbetrieb" },
  { name: "Reinigung & Müll", sphere: "zweckbetrieb" },
  { name: "Sicherheit & Awareness", sphere: "zweckbetrieb" },
  { name: "Sonstige Ausgabe (Zweckbetrieb)", sphere: "zweckbetrieb" },
  { name: "Strom / Generator", sphere: "zweckbetrieb" },
  { name: "Technik-Miete/-Kauf", sphere: "zweckbetrieb" },
  { name: "Ticketgebühren / Zahlungsdienstleister", sphere: "zweckbetrieb" },
  { name: "Übernachtung (Artists)", sphere: "zweckbetrieb" },
  { name: "Übernachtung (Event)", sphere: "zweckbetrieb" },
  { name: "Verpflegung (Event)", sphere: "zweckbetrieb" },

  // --- 3 WIRTSCHAFTLICH (WGB) ---
  { name: "Getränke-Einkauf (Bar)", sphere: "wirtschaftlich" },
  { name: "Merch-Einkauf / -Produktion", sphere: "wirtschaftlich" },
  { name: "Sonstige Ausgabe (WGB)", sphere: "wirtschaftlich" },
];

const EINNAHMEN_KATEGORIEN: KatRow[] = [
  { name: "Aufnahmegebühr", sphere: "ideeller" },
  { name: "Bar-Umsatz", sphere: "wirtschaftlich" },
  { name: "Eintritt", sphere: "zweckbetrieb" },
  { name: "Garderobe", sphere: "zweckbetrieb" },
  { name: "Honorar künstlerische Leistung", sphere: "zweckbetrieb" },
  { name: "Kuratierung & Künstlerische Leitung", sphere: "zweckbetrieb" },
  { name: "Merch-Verkauf", sphere: "wirtschaftlich" },
  { name: "Sonstige Einnahme (Ideell)", sphere: "ideeller" },
  { name: "Sonstige Einnahme (WGB)", sphere: "wirtschaftlich" },
  { name: "Sonstige Einnahme (Zweckbetrieb)", sphere: "zweckbetrieb" },
  { name: "Sponsoring (mit Gegenleistung)", sphere: "wirtschaftlich" },
  { name: "Workshop / Kursgebühr", sphere: "zweckbetrieb" },
  { name: "Zinsen", sphere: "vermoegen" },
  { name: "Zuschuss (zweckfrei)", sphere: "ideeller" },
  { name: "Zuschuss (zweckgebunden)", sphere: "ideeller" },
];

const ZAHLUNGSARTEN: Array<{
  kind: "bank" | "paypal" | "bar" | "lastschrift" | "verrechnung" | "verzicht";
  label: string;
}> = [
  { kind: "bank", label: "Banküberweisung" },
  { kind: "paypal", label: "PayPal" },
  { kind: "bar", label: "Bar" },
  { kind: "lastschrift", label: "Lastschrift" },
  { kind: "verrechnung", label: "Verrechnung" },
  { kind: "verzicht", label: "Verzichts-Spende" },
];

// Mail-template settings rows (bodies stay short — Phase 1's mail-core agent
// fills in the actual MJML/HTML; the seed only ensures keys exist).
const MAIL_TEMPLATE_KEYS = [
  "mail.template.magic_link",
  "mail.template.auslage_eingang",
  "mail.template.auslage_erstattet",
  "mail.template.auslage_abgelehnt",
  "mail.template.spende_bescheinigung",
  "mail.template.beitrag_reminder",
  "mail.template.invoice_versendet",
];

async function main() {
  const url = process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    console.error("ERROR: DIRECT_DATABASE_URL (or DATABASE_URL) is required.");
    process.exit(1);
  }
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  try {
    console.log("seed: kategorien …");
    for (let i = 0; i < AUSGABEN_KATEGORIEN.length; i++) {
      const k = AUSGABEN_KATEGORIEN[i]!;
      await db
        .insert(schema.kategorien)
        .values({
          kind: "expense",
          name: k.name,
          sphere: k.sphere,
          eurZeile: k.eurZeile ?? null,
          anlageGemZeile: k.anlageGemZeile ?? null,
          sortOrder: i,
        })
        .onConflictDoUpdate({
          target: [schema.kategorien.kind, schema.kategorien.name],
          set: {
            sphere: k.sphere,
            sortOrder: i,
            updatedAt: new Date(),
          },
        });
    }
    for (let i = 0; i < EINNAHMEN_KATEGORIEN.length; i++) {
      const k = EINNAHMEN_KATEGORIEN[i]!;
      await db
        .insert(schema.kategorien)
        .values({
          kind: "income",
          name: k.name,
          sphere: k.sphere,
          eurZeile: k.eurZeile ?? null,
          anlageGemZeile: k.anlageGemZeile ?? null,
          sortOrder: i,
        })
        .onConflictDoUpdate({
          target: [schema.kategorien.kind, schema.kategorien.name],
          set: {
            sphere: k.sphere,
            sortOrder: i,
            updatedAt: new Date(),
          },
        });
    }
    console.log(
      `seed: ${AUSGABEN_KATEGORIEN.length} expense + ${EINNAHMEN_KATEGORIEN.length} income kategorien upserted`,
    );

    console.log("seed: zahlungsarten …");
    for (const z of ZAHLUNGSARTEN) {
      await db
        .insert(schema.zahlungsarten)
        .values({ kind: z.kind, label: z.label })
        .onConflictDoUpdate({
          target: schema.zahlungsarten.label,
          set: { kind: z.kind },
        });
    }
    console.log(`seed: ${ZAHLUNGSARTEN.length} zahlungsarten upserted`);

    console.log("seed: settings …");
    // Audit chain genesis (ADR-0004) — set once on first seed; never overwritten.
    await db
      .insert(schema.settings)
      .values({
        key: "audit_chain_genesis_at",
        value: { iso: new Date().toISOString() },
      })
      .onConflictDoNothing();

    // Bankverbindung (legacy BANKVERBINDUNG).
    await db
      .insert(schema.settings)
      .values({
        key: "verein.bankverbindung",
        value: {
          empfaenger: "Folge der Wolke e.V.",
          iban: "DE25830654080006894453",
          bic: "GENODEF1SLR",
          bank: "Deutsche Skatbank",
        },
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: {
          value: {
            empfaenger: "Folge der Wolke e.V.",
            iban: "DE25830654080006894453",
            bic: "GENODEF1SLR",
            bank: "Deutsche Skatbank",
          },
          updatedAt: new Date(),
        },
      });

    // Verein-Stammdaten (legacy VEREIN_FOOTER).
    await db
      .insert(schema.settings)
      .values({
        key: "verein.stammdaten",
        value: {
          name: "Folge der Wolke e.V.",
          strasse: "Westermühlstraße 6",
          plz_stadt: "80469 München",
          register:
            "eingetragen im Vereinsregister des AG München unter VR 211227",
          steuernr: "143/215/10028",
          kontakt: "folgederwolke@gmail.com",
        },
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: {
          value: {
            name: "Folge der Wolke e.V.",
            strasse: "Westermühlstraße 6",
            plz_stadt: "80469 München",
            register:
              "eingetragen im Vereinsregister des AG München unter VR 211227",
            steuernr: "143/215/10028",
            kontakt: "folgederwolke@gmail.com",
          },
          updatedAt: new Date(),
        },
      });

    // Default Mitgliedsbeitrag per Jahr (legacy MITGLIEDSBEITRAG_PER_JAHR_EUR = 69.69).
    await db
      .insert(schema.settings)
      .values({
        key: "verein.mitgliedsbeitrag.default_cents",
        value: { cents: 6969 },
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: { cents: 6969 }, updatedAt: new Date() },
      });

    // Mail template placeholders.
    for (const key of MAIL_TEMPLATE_KEYS) {
      await db
        .insert(schema.settings)
        .values({
          key,
          value: {
            subject: "(seed placeholder)",
            body_text: "",
            body_html: "",
          },
        })
        .onConflictDoNothing();
    }
    console.log("seed: settings upserted");

    // Fixtures last — depend on members/projects/customers tables.
    await seedFixtures(db);

    // Sanity check.
    const totals = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM kategorien)::int AS kategorien,
        (SELECT count(*) FROM zahlungsarten)::int AS zahlungsarten,
        (SELECT count(*) FROM settings)::int AS settings,
        (SELECT count(*) FROM members WHERE is_fixture = true)::int AS members_fixture,
        (SELECT count(*) FROM projects WHERE is_fixture = true)::int AS projects_fixture,
        (SELECT count(*) FROM customers WHERE is_fixture = true)::int AS customers_fixture
    `);
    console.log("seed: totals =", totals[0]);
    console.log("seed: done.");
  } finally {
    await client.end();
  }
}

await main();
