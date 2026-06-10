/**
 * @vitest-environment node
 * @phase-2
 *
 * Regression tests for the Tier 1 production-hardening fixes shipped after the
 * 2026-05-20 audit.
 *
 *   1. Festschreibung trigger now actually fires for `app_runtime` (was
 *      reading the wrong jsonb shape → silently short-circuited). Migration
 *      0014 also extends the trigger to BEFORE INSERT (not just UPDATE/
 *      DELETE) and bypasses for `session_user <> 'app_runtime'` so tests +
 *      migrations are unaffected.
 *   2. `settings.festgeschrieben_bis` may only move forward when written by
 *      `app_runtime`; DELETE is forbidden for that role.
 *   3. `donations.bescheinigung_nr_year_ck` rejects year-mismatched
 *      Bescheinigungs-Nummern regardless of role (CHECK constraints don't
 *      have a session_user bypass; the data invariant must hold).
 *   4. `allocateBusinessId()` default year is Berlin-local (ADR-0001).
 *
 * Trigger-enforcement assertions use DATABASE_URL (app_runtime). Setup and
 * teardown use DIRECT_DATABASE_URL (postgres) so it bypasses the triggers.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import postgres from "postgres";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";

const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)(
  "Tier 1 — Festschreibung INSERT trigger (C1)",
  () => {
    let admin: ReturnType<typeof postgres>; // superuser — setup + teardown
    let app: ReturnType<typeof postgres>; // app_runtime — trigger fires here
    const LOCKED_YEAR = 2098;
    const SAFE_YEAR = LOCKED_YEAR + 1;
    // P1-T10: expenses.kategorie_id is NOT NULL — resolve a real seeded
    // expense Kategorie so the fixture row is valid except for the year-lock
    // trigger / CHECK these tests actually exercise.
    let EXP_KAT_ID = "";

    beforeAll(async () => {
      admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
      app = postgres(DATABASE_URL, { prepare: false, max: 1 });
      const [ke] = await admin<
        { id: string }[]
      >`SELECT id FROM kategorien WHERE kind = 'expense' LIMIT 1`;
      if (!ke) throw new Error("tier-1: missing seeded expense kategorie");
      EXP_KAT_ID = ke.id;
    });

    afterEach(async () => {
      // Always restore festgeschrieben_bis to null and clean test rows.
      // Use upsert so the row exists even on a fresh DB where the seed
      // hasn't inserted it.
      await admin`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', 'null'::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb
      `;
      await admin`DELETE FROM expenses WHERE business_id LIKE ${`A-${LOCKED_YEAR}-%`} OR business_id LIKE ${`A-${SAFE_YEAR}-%`}`;
    });

    afterAll(async () => {
      await admin.end();
      await app.end();
    });

    async function lockYear(y: number) {
      await admin`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(y)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }

    async function insertExpense(
      conn: ReturnType<typeof postgres>,
      year: number,
      seq: string,
    ) {
      return conn`
        INSERT INTO expenses (
          business_id, source, gebucht_am, betrag_cents, currency, bezeichnung,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot,
          bezahlt_von_kind, bezahlt_von_display, status, beleg_verzicht_grund
        ) VALUES (
          ${`A-${year}-${seq}`}, 'app',
          ${`${year}-06-15 10:00:00+02`},
          1000, 'EUR', 'tier-1 trigger test',
          ${EXP_KAT_ID}::uuid, '(Unkategorisiert)', 'ideeller',
          'verein', 'Verein', 'geprueft', 'tier-1 fixture — kein Beleg'
        )
      `;
    }

    it("rejects INSERT into expenses for a closed year (app_runtime)", async () => {
      await lockYear(LOCKED_YEAR);
      let err: unknown = null;
      try {
        await insertExpense(app, LOCKED_YEAR, "001");
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("allows INSERT into expenses for a year above the lock (app_runtime)", async () => {
      await lockYear(LOCKED_YEAR);
      await expect(insertExpense(app, SAFE_YEAR, "001")).resolves.toBeDefined();
    });

    it("rejects UPDATE of expenses in a closed year (app_runtime)", async () => {
      await admin`UPDATE settings SET value = 'null'::jsonb WHERE key = 'festgeschrieben_bis'`;
      await insertExpense(admin, LOCKED_YEAR, "002");
      await lockYear(LOCKED_YEAR);

      let err: unknown = null;
      try {
        await app`UPDATE expenses SET bezeichnung = 'mutated' WHERE business_id = ${`A-${LOCKED_YEAR}-002`}`;
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("bypasses for superuser (setup/migration path stays unblocked)", async () => {
      await lockYear(LOCKED_YEAR);
      // Same INSERT that would fail for app_runtime — superuser must pass.
      await expect(
        insertExpense(admin, LOCKED_YEAR, "003"),
      ).resolves.toBeDefined();
    });
  },
);

describe.skipIf(!dbConfigured)(
  "Tier 1 — settings.festgeschrieben_bis monotonic (C3)",
  () => {
    let admin: ReturnType<typeof postgres>;
    let app: ReturnType<typeof postgres>;

    beforeAll(async () => {
      admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
      app = postgres(DATABASE_URL, { prepare: false, max: 1 });
    });

    async function upsertBis(
      conn: ReturnType<typeof postgres>,
      value: number | null,
    ) {
      const v = value === null ? "null" : String(value);
      return conn`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${v}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }

    afterEach(async () => {
      // Superuser-only reset bypasses the monotonic trigger.
      await upsertBis(admin, null);
    });

    afterAll(async () => {
      await admin.end();
      await app.end();
    });

    it("allows the first-ever Festschreibung (NULL → year) from app_runtime", async () => {
      await upsertBis(admin, null);
      await expect(upsertBis(app, 2024)).resolves.toBeDefined();
    });

    it("allows a forward move (2024 → 2025) from app_runtime", async () => {
      await upsertBis(admin, 2024);
      await expect(upsertBis(app, 2025)).resolves.toBeDefined();
    });

    it("rejects a backward move (2025 → 2024) from app_runtime", async () => {
      await upsertBis(admin, 2025);
      let err: unknown = null;
      try {
        await upsertBis(app, 2024);
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("rejects DELETE of festgeschrieben_bis from app_runtime once set", async () => {
      await upsertBis(admin, 2024);
      let err: unknown = null;
      try {
        await app`DELETE FROM settings WHERE key = 'festgeschrieben_bis'`;
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("rejects renaming the festgeschrieben_bis key away from app_runtime", async () => {
      // Closes the rename-the-row loophole flagged in independent review.
      await upsertBis(admin, 2024);
      let err: unknown = null;
      try {
        await app`UPDATE settings SET key = 'festgeschrieben_bis_old' WHERE key = 'festgeschrieben_bis'`;
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("does NOT interfere with other settings keys (app_runtime)", async () => {
      const otherKey = `tier1_unrelated_${Date.now()}`;
      await admin`INSERT INTO settings (key, value) VALUES (${otherKey}, 'true'::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
      await expect(
        app`UPDATE settings SET value = 'false'::jsonb WHERE key = ${otherKey}`,
      ).resolves.toBeDefined();
      await admin`DELETE FROM settings WHERE key = ${otherKey}`;
    });
  },
);

describe.skipIf(!dbConfigured)(
  "Tier 1 — donations.bescheinigung_nr year-consistency (C5)",
  () => {
    // CHECK constraints don't have a session_user bypass — they always
    // enforce. Tests use admin connection for both setup and assertion.
    let sql: ReturnType<typeof postgres>;
    // P1-T10: donations.kategorie_id is NOT NULL — a Geldspende zweckfrei's
    // Kategorie is the seeded income kategorie "Geldspende zweckfrei".
    let DON_KAT_ID = "";

    beforeAll(async () => {
      sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
      const [kd] = await sql<{ id: string }[]>`SELECT id FROM kategorien
        WHERE kind = 'income' AND name = 'Geldspende zweckfrei' LIMIT 1`;
      if (!kd) {
        throw new Error("tier-1: missing 'Geldspende zweckfrei' kategorie");
      }
      DON_KAT_ID = kd.id;
    });

    afterEach(async () => {
      await sql`DELETE FROM donations WHERE business_id LIKE 'S-2097-%'`;
    });

    afterAll(async () => {
      await sql.end();
    });

    async function insertDonationWithBescheinigung(
      bid: string,
      ts: string,
      bescheinigungNr: string | null,
    ) {
      return sql`
        INSERT INTO donations (
          business_id, gebucht_am, betrag_cents, spender_name,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot,
          spende_kind, zweckbindung_kind, bescheinigung_nr
        ) VALUES (
          ${bid}, ${ts}, 10000, 'Tier 1 Test',
          ${DON_KAT_ID}::uuid, 'Geldspende zweckfrei', 'ideeller',
          'geldspende', 'zweckfrei',
          ${bescheinigungNr}
        )
      `;
    }

    it("accepts a matching year (donation 2097, Bescheinigung B-2097-001)", async () => {
      await expect(
        insertDonationWithBescheinigung(
          "S-2097-001",
          "2097-03-01 10:00:00+01",
          "B-2097-001",
        ),
      ).resolves.toBeDefined();
    });

    it("accepts NULL bescheinigung_nr", async () => {
      await expect(
        insertDonationWithBescheinigung(
          "S-2097-002",
          "2097-04-01 10:00:00+01",
          null,
        ),
      ).resolves.toBeDefined();
    });

    it("rejects a mismatched year (donation 2097, Bescheinigung B-2024-001)", async () => {
      let err: unknown = null;
      try {
        await insertDonationWithBescheinigung(
          "S-2097-003",
          "2097-05-01 10:00:00+01",
          "B-2024-001",
        );
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });
  },
);

describe("Tier 1 — allocator default uses Berlin year (C4)", () => {
  it("berlinYear() reflects Berlin-local rollover at the UTC year boundary", async () => {
    // Dec 31 2026 23:30 UTC is already Jan 1 2027 00:30 in Europe/Berlin
    // (CET = UTC+1). The OLD allocator default `new Date().getFullYear()`
    // would return 2026 (UTC year); the fixed default `berlinYear()` returns
    // 2027 so the next business-id allocation lands in the new
    // Buchhaltungsjahr.
    const boundaryUtc = new Date(Date.UTC(2026, 11, 31, 23, 30, 0));
    const { berlinYear } = await import("$lib/domain/year.js");
    expect(berlinYear(boundaryUtc)).toBe(2027);
  });

  it("allocateBusinessId default param has length 1 (kind required, year defaulted)", () => {
    // Compile-time pin: if a future edit removes the default value on `year`,
    // the function's published arity changes from 1 → 2 and this fails.
    expect(allocateBusinessId.length).toBe(1);
  });
});
