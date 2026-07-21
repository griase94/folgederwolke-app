/**
 * Item 4 — allocateBescheinigung must NEVER report a B-number the row does not
 * actually carry.
 *
 * allocateBusinessId commits on its OWN transaction, so between the in-tx
 * re-check (`bescheinigung_nr IS NULL`) and the guarded UPDATE a concurrent
 * caller can win and set the number. The old code's UPDATE had no rowcount /
 * RETURNING check, so on a 0-row UPDATE it kept the freshly-allocated (orphaned)
 * number and reported it — diverging from the row's persisted value.
 *
 * The fix mirrors markExpenseAsPaid: RETURNING is the authoritative "I wrote it"
 * signal; on a 0-row UPDATE we re-read the row and surface the idempotent winner.
 *
 * This asserts the invariant END-TO-END against a real DB: the returned
 * bescheinigungNr ALWAYS equals the value persisted on the donation row, and a
 * repeat allocate is idempotent (same number, never a second orphaned B-Nr).
 *
 * DB-backed → RESET lane:
 *   set -a && source .env.test && set +a && pnpm test --run <file>
 *
 * The bescheinigung env gate (isBescheinigungEnabled) is parsed eagerly at
 * module load, so we set the required VEREIN_* vars on process.env BEFORE the
 * dynamic import of the domain module.
 */

import { describe, it, expect, beforeAll } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// Enable the Bescheinigung gate (freistellungsbescheid variant) BEFORE importing
// the domain — env.ts parses process.env eagerly at module load.
process.env["VEREIN_BESCHEID_TYP"] = "freistellungsbescheid";
process.env["VEREIN_BESCHEID_DATUM"] = "2024-03-15";
process.env["VEREIN_FREISTELLUNGSBESCHEID_VZ"] = "2023";

describe.skipIf(!dbConfigured)(
  "allocateBescheinigung — reported number == persisted row",
  () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let createSpende: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allocateBescheinigung: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let getDb: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let donations: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let users: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let eq: any;
    let ACTOR = "";

    beforeAll(async () => {
      ({ createSpende, allocateBescheinigung } =
        await import("$lib/server/domain/spenden.js"));
      ({ getDb } = await import("$lib/server/db/index.js"));
      ({ donations } = await import("$lib/server/db/schema/donations.js"));
      ({ users } = await import("$lib/server/db/schema/users.js"));
      ({ eq } = await import("drizzle-orm"));

      const [u] = await getDb()
        .insert(users)
        .values({
          email: "bescheinigung-race-test@example.com",
          emailCanonical: "bescheinigung-race-test@example.com",
          name: "Bescheinigung Race Test",
        })
        .returning({ id: users.id });
      if (!u) throw new Error("failed to seed actor user");
      ACTOR = u.id;
    });

    async function seedDonation(): Promise<string> {
      const r = await createSpende(
        {
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckfrei",
          zugewendet_am: "2026-03-01",
          betragCents: "5000",
          spender_name: "Erika Externe",
          spender_adresse: "Hauptstr. 1, 10115 Berlin",
        },
        ACTOR,
      );
      expect(r.ok).toBe(true);
      return r.donationId as string;
    }

    it("returns a B-number that is actually persisted on the row", async () => {
      const id = await seedDonation();
      const res = await allocateBescheinigung(id, ACTOR);
      expect(res.ok).toBe(true);
      expect(res.bescheinigungNr).toMatch(/^B-\d{4}-\d{3,}$/);

      const [row] = await getDb()
        .select({ bescheinigungNr: donations.bescheinigungNr })
        .from(donations)
        .where(eq(donations.id, id))
        .limit(1);
      // The reported number MUST equal the row's persisted value (the invariant
      // the .returning() / re-read fix protects).
      expect(row?.bescheinigungNr).toBe(res.bescheinigungNr);
    });

    it("is idempotent: a repeat allocate returns the SAME number (no orphaned B-Nr)", async () => {
      const id = await seedDonation();
      const first = await allocateBescheinigung(id, ACTOR);
      expect(first.ok).toBe(true);
      const second = await allocateBescheinigung(id, ACTOR);
      expect(second.ok).toBe(true);
      // Same number both times — the second call must NOT mint a new B-Nr.
      expect(second.bescheinigungNr).toBe(first.bescheinigungNr);

      const [row] = await getDb()
        .select({ bescheinigungNr: donations.bescheinigungNr })
        .from(donations)
        .where(eq(donations.id, id))
        .limit(1);
      expect(row?.bescheinigungNr).toBe(first.bescheinigungNr);
    });

    // ADR-0006 Nachtrag (certificate carve-out, migration 0038): a
    // Zuwendungsbestätigung may be issued even for a festgeschriebene Spende —
    // allocateBescheinigung no longer 409s, and the DB trigger permits exactly
    // the certificate columns the UPDATE writes. Booking values stay locked.
    it("issues on a festgeschriebene Spende (certificate carve-out)", async () => {
      const admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
      try {
        // Clear any prior lock, create a 2015 Spende, THEN lock 2015 (so the
        // create itself is never blocked). Locking via superuser bypasses the
        // monotonic settings guard.
        await admin`UPDATE settings SET value = 'null'::jsonb WHERE key = 'festgeschrieben_bis'`;
        const r = await createSpende(
          {
            spende_kind: "geldspende",
            zweckbindung_kind: "zweckfrei",
            zugewendet_am: "2015-06-01",
            betragCents: "5000",
            spender_name: "Frieda Fest",
            spender_adresse: "Nebenstr. 2, 10115 Berlin",
          },
          ACTOR,
        );
        expect(r.ok).toBe(true);
        const id = r.donationId as string;

        await admin`
          INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(2015)})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;

        const res = await allocateBescheinigung(id, ACTOR);
        expect(res.ok).toBe(true);
        expect(res.bescheinigungNr).toMatch(/^B-\d{4}-\d{3,}$/);

        const [row] = await getDb()
          .select({ bescheinigungNr: donations.bescheinigungNr })
          .from(donations)
          .where(eq(donations.id, id))
          .limit(1);
        expect(row?.bescheinigungNr).toBe(res.bescheinigungNr);
      } finally {
        await admin`UPDATE settings SET value = 'null'::jsonb WHERE key = 'festgeschrieben_bis'`;
        await admin.end();
      }
    });
  },
);
