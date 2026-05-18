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

import { and, eq } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";
import * as schema from "../src/lib/server/db/schema/index.js";
import { canonicalizeEmail } from "../src/lib/domain/email.js";

type Db = ReturnType<typeof drizzle<typeof schema>>;
type Client = ReturnType<typeof postgres>;

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
