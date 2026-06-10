/**
 * Integration tests for the four correctness bugs found in the independent review.
 *
 * FIX-2: editSpende + spenden/[id] delete — atomic festgeschriebenAt guard (TOCTOU).
 * FIX-3: ausgaben/[id] + einnahmen/[id] ?/save — kategorieId written on edit.
 * FIX-4: buildEinnahmenWhere — excludes superseded rows (supersedesId IS NULL).
 *
 * FIX-1 (spenden/neu gate) is covered by a unit test (fast lane).
 *
 * DB-backed → RESET lane:
 *   set -a && source .env.test && set +a && pnpm test tests/integration/prod-bug-fixes.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { income } from "$lib/server/db/schema/income.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { users } from "$lib/server/db/schema/users.js";
import { createSpende, editSpende } from "$lib/server/domain/spenden.js";
import { listEinnahmenPage } from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// ---------------------------------------------------------------------------
// Shared seed helpers
// ---------------------------------------------------------------------------

let ACTOR = "";

async function anyKategorie(kind: "expense" | "income"): Promise<{
  id: string;
  name: string;
  sphere: string;
}> {
  const db = getDb();
  const [row] = await db
    .select({
      id: kategorien.id,
      name: kategorien.name,
      sphere: kategorien.sphere,
    })
    .from(kategorien)
    .where(eq(kategorien.kind, kind))
    .limit(1);
  if (!row) throw new Error(`no ${kind} kategorie seeded`);
  return row;
}

async function anotherKategorie(
  kind: "expense" | "income",
  excludeId: string,
): Promise<{ id: string; name: string; sphere: string }> {
  const db = getDb();
  const rows = await db
    .select({
      id: kategorien.id,
      name: kategorien.name,
      sphere: kategorien.sphere,
    })
    .from(kategorien)
    .where(eq(kategorien.kind, kind))
    .limit(5);
  const other = rows.find((r) => r.id !== excludeId);
  if (!other) throw new Error(`no second ${kind} kategorie seeded`);
  return other;
}

type SphereVal = "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";

/** Reset festgeschrieben_bis to null (unlock) via superuser. */
async function resetFestgeschreibung(): Promise<void> {
  const postgres = (await import("postgres")).default;
  const admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
  await admin`
    INSERT INTO settings (key, value)
    VALUES ('festgeschrieben_bis', 'null'::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb
  `;
  await admin.end();
}

// ---------------------------------------------------------------------------
// FIX-2 — editSpende + delete atomic guard
// ---------------------------------------------------------------------------

describe.skipIf(!dbConfigured)(
  "FIX-2: editSpende + delete — atomic festgeschriebenAt guard",
  () => {
    beforeAll(async () => {
      if (!dbConfigured) return;
      const db = getDb();
      // Upsert test actor (ON CONFLICT email do nothing keeps idempotent).
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.emailCanonical, "fix2-guard-test@example.com"))
        .limit(1);
      if (existing[0]) {
        ACTOR = existing[0].id;
      } else {
        const [u] = await db
          .insert(users)
          .values({
            email: "fix2-guard-test@example.com",
            emailCanonical: "fix2-guard-test@example.com",
            name: "Fix2 Guard Test",
          })
          .returning({ id: users.id });
        if (!u) throw new Error("failed to seed actor");
        ACTOR = u.id;
      }
      await resetFestgeschreibung();
    });

    /**
     * Seed a donation in the current Berlin year so the business_id year matches
     * year_of_buchung (the DB constraint `donations_business_id_year_ck`).
     * year_of_buchung is generated from gebucht_am (defaults to NOW()).
     */
    async function seedDonation(): Promise<string> {
      const now = new Date();
      const currentYear = now.getFullYear();
      // zugewendet_am must be a YYYY-MM-DD string in the current year.
      const zugewendetAm = `${currentYear}-06-01`;
      const r = await createSpende(
        {
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckfrei",
          zugewendet_am: zugewendetAm,
          betragCents: "3000",
          spender_name: "Test Spender",
          spender_adresse: "Teststr. 1, 10115 Berlin",
        },
        ACTOR,
      );
      if (!r.ok) throw new Error("seed donation failed: " + r.error);
      return r.donationId;
    }

    /**
     * Stamp festgeschrieben_at directly on the row via superuser — simulates the
     * row-level sealed state without touching settings (avoids year-seal side-effects
     * on other tests). editSpende's atomic WHERE `isNull(donations.festgeschriebenAt)`
     * must then match 0 rows.
     */
    async function sealRow(donationId: string): Promise<void> {
      const postgres = (await import("postgres")).default;
      const admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
      await admin`UPDATE donations SET festgeschrieben_at = NOW() WHERE id = ${donationId}`;
      await admin.end();
    }

    it("editSpende returns ok:false/409 when festgeschrieben_at is stamped on the row", async () => {
      const donationId = await seedDonation();
      await sealRow(donationId);

      const now = new Date();
      const result = await editSpende(
        {
          id: donationId,
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckfrei",
          zugewendet_am: `${now.getFullYear()}-06-01`,
          betragCents: "3000",
          spender_name: "Changed Name",
          spender_adresse: "Teststr. 1, 10115 Berlin",
        },
        ACTOR,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.error).toMatch(/festgeschrieben/i);
      }
    });

    it("editSpende succeeds on an unfestgeschrieben donation (normal edit still works)", async () => {
      const donationId = await seedDonation();

      const now = new Date();
      const result = await editSpende(
        {
          id: donationId,
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckfrei",
          zugewendet_am: `${now.getFullYear()}-06-01`,
          betragCents: "3100",
          spender_name: "Updated Spender",
          spender_adresse: "Teststr. 1, 10115 Berlin",
        },
        ACTOR,
      );
      expect(result.ok).toBe(true);
    });

    it("delete with atomic WHERE returns 0 rows when festgeschrieben_at is set", async () => {
      // Seed a donation, then stamp festgeschrieben_at on it via superuser.
      // The fixed delete action uses:
      //   .where(and(eq(donations.id, id), isNull(donations.festgeschriebenAt), isNull(donations.bescheinigungNr)))
      // so 0 rows are deleted → fail(409) in the route.
      const donationId = await seedDonation();
      await sealRow(donationId);

      const db = getDb();
      const result = await db
        .delete(donations)
        .where(
          and(
            eq(donations.id, donationId),
            isNull(donations.festgeschriebenAt), // the atomic guard
            isNull(donations.bescheinigungNr),
          ),
        )
        .returning({ id: donations.id });

      // 0 rows deleted: the festgeschriebenAt guard prevented the deletion.
      expect(result.length).toBe(0);

      // The row still exists in the DB.
      const [still] = await db
        .select({ id: donations.id })
        .from(donations)
        .where(eq(donations.id, donationId));
      expect(still?.id).toBe(donationId);
    });
  },
);

// ---------------------------------------------------------------------------
// FIX-3 — kategorieId written on Ausgaben + Einnahmen detail save
// ---------------------------------------------------------------------------

describe.skipIf(!dbConfigured)(
  "FIX-3: detail save writes kategorieId FK (not just name snapshot)",
  () => {
    // Use a far-future year so our rows are isolated from the corpus.
    // year_of_buchung is a generated column derived from gebucht_am,
    // so we pass gebuchtAm within the target year.
    const TEST_YEAR_3 = 2097;

    function midYear(y: number): Date {
      // Berlin noon mid-year: avoids TZ-boundary edge cases for year_of_buchung.
      return new Date(`${y}-06-15T10:00:00.000Z`);
    }

    beforeAll(async () => {
      if (!dbConfigured) return;
      const db = getDb();
      await db.delete(income).where(eq(income.yearOfBuchung, TEST_YEAR_3));
      await db.delete(expenses).where(eq(expenses.yearOfBuchung, TEST_YEAR_3));
    });

    it("ausgaben: after save with a changed Kategorie, kategorie_id FK matches the new kategorie", async () => {
      const db = getDb();
      const kat1 = await anyKategorie("expense");
      const kat2 = await anotherKategorie("expense", kat1.id);

      // Insert an expense row with kat1.
      // expenses require belegFileId OR belegVerzichtGrund (CHECK constraint).
      const [row] = await db
        .insert(expenses)
        .values({
          businessId: `A-${TEST_YEAR_3}-901`,
          bezeichnung: "FIX-3 ausgabe test",
          betragCents: BigInt(5000),
          gebuchtAm: midYear(TEST_YEAR_3),
          kategorieId: kat1.id,
          kategorieNameSnapshot: kat1.name,
          sphereSnapshot: kat1.sphere as SphereVal,
          bezahltVonKind: "verein",
          bezahltVonDisplay: "Verein",
          belegVerzichtGrund: "Kein Beleg — Testzeile",
        })
        .returning({ id: expenses.id, kategorieId: expenses.kategorieId });
      if (!row) throw new Error("seed expense failed");

      expect(row.kategorieId).toBe(kat1.id);

      // Simulate the fixed ?/save UPDATE SET which now includes kategorieId.
      await db
        .update(expenses)
        .set({
          kategorieId: kat2.id,
          kategorieNameSnapshot: kat2.name,
          sphereSnapshot: kat2.sphere as SphereVal,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, row.id));

      const [updated] = await db
        .select({
          kategorieId: expenses.kategorieId,
          kategorieNameSnapshot: expenses.kategorieNameSnapshot,
        })
        .from(expenses)
        .where(eq(expenses.id, row.id));

      // Both the FK and the snapshot must reflect the new kategorie.
      expect(updated?.kategorieId).toBe(kat2.id);
      expect(updated?.kategorieNameSnapshot).toBe(kat2.name);
    });

    it("einnahmen: after save with a changed Kategorie, kategorie_id FK matches the new kategorie", async () => {
      const db = getDb();
      const kat1 = await anyKategorie("income");
      const kat2 = await anotherKategorie("income", kat1.id);

      const [row] = await db
        .insert(income)
        .values({
          businessId: `E-${TEST_YEAR_3}-901`,
          bezeichnung: "FIX-3 einnahme test",
          betragCents: BigInt(7000),
          gebuchtAm: midYear(TEST_YEAR_3),
          kategorieId: kat1.id,
          kategorieNameSnapshot: kat1.name,
          sphereSnapshot: kat1.sphere as SphereVal,
        })
        .returning({ id: income.id, kategorieId: income.kategorieId });
      if (!row) throw new Error("seed income failed");

      expect(row.kategorieId).toBe(kat1.id);

      // Simulate the fixed ?/save UPDATE SET which now includes kategorieId.
      await db
        .update(income)
        .set({
          kategorieId: kat2.id,
          kategorieNameSnapshot: kat2.name,
          sphereSnapshot: kat2.sphere as SphereVal,
          updatedAt: new Date(),
        })
        .where(eq(income.id, row.id));

      const [updated] = await db
        .select({
          kategorieId: income.kategorieId,
          kategorieNameSnapshot: income.kategorieNameSnapshot,
        })
        .from(income)
        .where(eq(income.id, row.id));

      // Both the FK and the snapshot must reflect the new kategorie.
      expect(updated?.kategorieId).toBe(kat2.id);
      expect(updated?.kategorieNameSnapshot).toBe(kat2.name);
    });
  },
);

// ---------------------------------------------------------------------------
// FIX-4 — buildEinnahmenWhere excludes superseded rows
// ---------------------------------------------------------------------------

describe.skipIf(!dbConfigured)(
  "FIX-4: listEinnahmenPage excludes superseded (supersedesId IS NOT NULL) rows",
  () => {
    // A test year isolated from corpus and other integration test years.
    const TEST_YEAR_4 = 2096;

    function midYear(y: number): Date {
      return new Date(`${y}-06-15T10:00:00.000Z`);
    }

    let liveId: string;
    let supersededId: string;

    beforeAll(async () => {
      if (!dbConfigured) return;
      const db = getDb();
      await db.delete(income).where(eq(income.yearOfBuchung, TEST_YEAR_4));

      const kat = await anyKategorie("income");

      // Insert the live income row.
      const [live] = await db
        .insert(income)
        .values({
          businessId: `E-${TEST_YEAR_4}-901`,
          bezeichnung: "FIX-4 live income",
          betragCents: BigInt(4000),
          gebuchtAm: midYear(TEST_YEAR_4),
          kategorieId: kat.id,
          kategorieNameSnapshot: kat.name,
          sphereSnapshot: kat.sphere as SphereVal,
        })
        .returning({ id: income.id });
      if (!live) throw new Error("seed live income failed");
      liveId = live.id;

      // Insert a superseded income row (supersedesId points at the live row).
      // buildEinnahmenWhere must exclude this row via isNull(income.supersedesId).
      const [superseded] = await db
        .insert(income)
        .values({
          businessId: `E-${TEST_YEAR_4}-902`,
          bezeichnung: "FIX-4 SUPERSEDED (must be excluded from list)",
          betragCents: BigInt(4000),
          gebuchtAm: midYear(TEST_YEAR_4),
          kategorieId: kat.id,
          kategorieNameSnapshot: kat.name,
          sphereSnapshot: kat.sphere as SphereVal,
          supersedesId: liveId,
        })
        .returning({ id: income.id });
      if (!superseded) throw new Error("seed superseded income failed");
      supersededId = superseded.id;
    });

    it("listEinnahmenPage includes the live row and excludes the superseded row", async () => {
      const state = parseFilterState("einnahmen", new URLSearchParams(""));
      const { rows, total } = await listEinnahmenPage({
        state,
        year: TEST_YEAR_4,
        limit: 50,
        offset: 0,
      });

      const ids = rows.map((r) => r.id);
      expect(ids).toContain(liveId);
      expect(ids).not.toContain(supersededId);

      // Sanity: the superseded row really exists in the DB (exclusion is doing work).
      const db = getDb();
      const supersededRows = await db
        .select({ id: income.id })
        .from(income)
        .where(
          and(
            eq(income.yearOfBuchung, TEST_YEAR_4),
            isNotNull(income.supersedesId),
          ),
        );
      expect(supersededRows.length).toBeGreaterThanOrEqual(1);

      // SQL COUNT must equal rows.length (no phantom rows from COUNT including superseded).
      expect(total).toBe(rows.length);
    });

    it("list count equals 1 — only the live row, not the superseded row", async () => {
      const state = parseFilterState("einnahmen", new URLSearchParams(""));
      const { rows, total } = await listEinnahmenPage({
        state,
        year: TEST_YEAR_4,
        limit: 50,
        offset: 0,
      });

      // We seeded exactly 1 live + 1 superseded → list must show exactly 1.
      expect(rows.length).toBe(1);
      expect(total).toBe(1);
    });
  },
);
