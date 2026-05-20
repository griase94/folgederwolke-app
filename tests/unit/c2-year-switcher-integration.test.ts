/**
 * C2 — Integration tests for the global year switcher's server-side surface.
 *
 * Combines what would otherwise be two separate spec files into one to keep
 * vitest's per-file parallelism from racing on `settings.festgeschrieben_bis`
 * (vitest 4 defaults to fileParallelism even with `singleFork: true`, so
 * two specs hammering the same row interleave in unpredictable ways).
 *
 * Tests both:
 *   - `listAvailableYears()` (src/lib/server/domain/years.ts)
 *   - `/app/+layout.server.ts.load()` (year context exposed to every page)
 *
 * Resolves: VB-002 (no year switching), JB-001 (no global year filter),
 * JB-003 (festgeschrieben-bug — 0/null was being shown as closed),
 * JB-006 (`?year=…` ignored on dashboard), UX-010 (year was implicit).
 *
 * Integration-style — uses the real test DB. Matches the spec's refusal-
 * pattern rule: no vi.mock for db/storage/mail.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { load as layoutLoad } from "../../src/routes/app/+layout.server.js";
import { listAvailableYears } from "$lib/server/domain/years.js";
import { currentBuchungsjahr } from "$lib/domain/year.js";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

// Layout return-shape — pulled out to keep test bodies tidy and avoid
// repeating the awkward `Awaited<ReturnType<…>>` cast.
type LayoutData = {
  availableYears: { year: number; closed: boolean }[];
  selectedYear: number;
  currentYear: number;
  festgeschriebenBis: number | null;
};

function makeEvent(searchString: string) {
  return {
    url: new URL(`http://localhost/app${searchString}`),
    locals: {
      session: {
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "admin@example.com",
          name: "Admin",
          isAdmin: true,
        },
      },
    },
  } as unknown as Parameters<typeof layoutLoad>[0];
}

async function runLoad(searchString: string): Promise<LayoutData> {
  return (await layoutLoad(makeEvent(searchString))) as unknown as LayoutData;
}

describe.skipIf(!url)(
  "C2 year-switcher server surface (VB-002 / JB-001 / JB-003 / JB-006 / UX-010)",
  () => {
    let sql: ReturnType<typeof postgres>;

    beforeAll(() => {
      sql = postgres(url, { prepare: false, max: 1 });
    });

    afterEach(async () => {
      // Reset settings row; each test that needs it explicitly inserts.
      await sql`DELETE FROM settings WHERE key = 'festgeschrieben_bis'`;
    });

    // ──────────────────────────────────────────────────────────────────
    // listAvailableYears (src/lib/server/domain/years.ts)
    // ──────────────────────────────────────────────────────────────────

    describe("listAvailableYears", () => {
      it("returns at least the current Buchungsjahr on an empty DB (JB-004 follow-up)", async () => {
        const years = await listAvailableYears();
        const current = currentBuchungsjahr();
        const yearNumbers = years.map((y) => y.year);
        expect(yearNumbers).toContain(current);
      });

      it("returns years sorted descending (newest first)", async () => {
        const years = await listAvailableYears();
        const ys = years.map((y) => y.year);
        const sorted = [...ys].sort((a, b) => b - a);
        expect(ys).toEqual(sorted);
      });

      it("never reports a year as closed when settings.festgeschrieben_bis is unset (JB-003)", async () => {
        await sql`DELETE FROM settings WHERE key = 'festgeschrieben_bis'`;
        const years = await listAvailableYears();
        for (const y of years) {
          expect(y.closed, `year ${y.year} should not be closed`).toBe(false);
        }
      });

      it("reports years <= settings.festgeschrieben_bis as closed (ADR-0006)", async () => {
        await sql`
          INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', '2024'::jsonb)
          ON CONFLICT (key) DO UPDATE SET value = '2024'::jsonb
        `;
        const years = await listAvailableYears();
        const yMap = new Map(years.map((y) => [y.year, y.closed]));
        const current = currentBuchungsjahr();
        expect(yMap.get(current)).toBe(false);
        // listAvailableYears must surface every Buchungsjahr <= bis even if
        // no bookings exist, so the switcher can show closed entries with
        // a lock icon.
        expect(yMap.has(2024)).toBe(true);
        expect(yMap.get(2024)).toBe(true);
        expect(yMap.has(2023)).toBe(true);
        expect(yMap.get(2023)).toBe(true);
      });
    });

    // ──────────────────────────────────────────────────────────────────
    // /app/+layout.server.ts load
    // ──────────────────────────────────────────────────────────────────

    describe("/app/+layout.server.ts year context", () => {
      it("exposes availableYears + currentYear + selectedYear + festgeschriebenBis", async () => {
        const data = await runLoad("");
        expect(Array.isArray(data.availableYears)).toBe(true);
        expect(data.availableYears.length).toBeGreaterThan(0);
        expect(typeof data.currentYear).toBe("number");
        expect(typeof data.selectedYear).toBe("number");
        expect(
          data.festgeschriebenBis === null ||
            typeof data.festgeschriebenBis === "number",
        ).toBe(true);
      });

      it("selectedYear defaults to current Buchungsjahr when ?year is absent", async () => {
        const data = await runLoad("");
        expect(data.selectedYear).toBe(currentBuchungsjahr());
      });

      it("selectedYear honors ?year=NNNN (JB-006 — the bug was that ?year was ignored)", async () => {
        const data = await runLoad("?year=2024");
        expect(data.selectedYear).toBe(2024);
      });

      it("selectedYear falls back to current year on garbage input", async () => {
        const data = await runLoad("?year=foo");
        expect(data.selectedYear).toBe(currentBuchungsjahr());
      });

      it("festgeschriebenBis reflects settings value", async () => {
        await sql`
          INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', '2024'::jsonb)
          ON CONFLICT (key) DO UPDATE SET value = '2024'::jsonb
        `;
        const data = await runLoad("");
        expect(data.festgeschriebenBis).toBe(2024);
      });
    });
  },
);
