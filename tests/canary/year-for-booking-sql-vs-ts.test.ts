// @canary
//
// SQL-vs-TS regression for the year_for_booking helper (ADR-0001).
//
// The TS mirror in src/lib/domain/year.ts MUST agree with the SQL
// year_for_booking() function on every boundary case — they're used in
// different code paths (TS for pre-write hints, SQL via the STORED generated
// column year_of_buchung) and a drift means rows get archived into the wrong
// Buchungsjahr.
//
// This canary runs against the test DB if DATABASE_URL is set. In contexts
// where the DB isn't booted (e.g. CI matrix shards without postgres) the test
// is skipped — the existing tests/canary/year-boundary.test.ts still asserts
// the TS half.
//
// TODO(post-foundations): wire DATABASE_URL into all CI shards so this no
// longer skips. See PR #41 reviewer cycle 1 (H2).

import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { yearForBooking } from "$lib/domain/year";

// Boundary timestamps: Berlin midnight on Jan 1, DST spring-forward (last
// Sunday of March), DST fall-back (last Sunday of October), Berlin midnight
// on Dec 31, and the inverse minute on the other side of midnight.
const CASES = [
  "2026-01-01T00:00:00+01:00", // Berlin Jan 1 → 2026
  "2025-12-31T23:59:59+01:00", // Berlin Dec 31 → 2025
  "2026-03-29T03:00:00+02:00", // post-spring-forward → 2026
  "2026-10-25T02:30:00+02:00", // ambiguous fall-back instant → 2026
  "2027-12-31T23:00:00+00:00", // 2028-01-01 00:00 Berlin → 2028
  "2025-12-31T23:00:00+00:00", // 2026-01-01 00:00 Berlin → 2026
];

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

describe.skipIf(!url)(
  "canary: SQL year_for_booking matches TS yearForBooking",
  () => {
    it("agrees on every boundary timestamp", async () => {
      const sql = postgres(url, { prepare: false, max: 1 });
      try {
        for (const ts of CASES) {
          const rows = await sql<{ y: number }[]>`
            SELECT year_for_booking(${ts}::timestamptz) AS y
          `;
          const sqlYear = rows[0]!.y;
          const tsYear = yearForBooking(new Date(ts));
          expect(
            sqlYear,
            `SQL vs TS disagree for ${ts}: SQL=${sqlYear} TS=${tsYear}`,
          ).toBe(tsYear);
        }
      } finally {
        await sql.end();
      }
    });
  },
);
