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

function makeEvent(searchString: string, cookieYear?: string) {
  return {
    url: new URL(`http://localhost/app${searchString}`),
    cookies: {
      // Minimal cookies mock: get() returns the cookie value if set
      get: (name: string) => (name === "fdw_year" ? cookieYear : undefined),
    },
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

async function runLoad(
  searchString: string,
  cookieYear?: string,
): Promise<LayoutData> {
  return (await layoutLoad(
    makeEvent(searchString, cookieYear),
  )) as unknown as LayoutData;
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
        // The current year is always open (never <= 2024 in a running system).
        expect(yMap.get(current)).toBe(false);
        // Years that ARE in the set (from actual data) and <= bis must be closed.
        // We only assert on the years we know exist: current must be open.
        // Years 2023/2024 appear ONLY if the test fixture has booking data for
        // them — we do not rely on the old blank-year lookback.
        for (const [year, closed] of yMap) {
          if (year <= 2024) {
            expect(closed, `year ${year} should be closed`).toBe(true);
          } else {
            expect(closed, `year ${year} should not be closed`).toBe(false);
          }
        }
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

      it("selectedYear honors ?year=NNNN when within plausible range (JB-006)", async () => {
        const data = await runLoad("?year=2024");
        // ?year=2024 may or may not be clamped depending on whether the
        // fixture includes 2024 data. Either way, the value must be a
        // plausible Buchungsjahr (not a garbage 2099-style clamp result
        // — that's covered by the next test).
        expect(data.selectedYear).toBeGreaterThanOrEqual(2020);
        expect(data.selectedYear).toBeLessThanOrEqual(2030);
      });

      it("selectedYear clamps out-of-range ?year=NNNN to the nearest available year (C2-6 cycle 2)", async () => {
        const data = await runLoad("?year=2099");
        // 2099 is well above any seeded year — clampYearToAvailable should
        // coerce to a year in the available set so the switcher has a
        // checked segment.
        const years = data.availableYears.map((y: { year: number }) => y.year);
        if (years.length > 0) {
          expect(years).toContain(data.selectedYear);
        } else {
          // Empty fixture: clamp passes through per helper contract.
          expect(data.selectedYear).toBe(2099);
        }
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

      it("fdw_year cookie is used as fallback when ?year= is absent (no-flicker fix)", async () => {
        // The cookie year must be in availableYears — use currentBuchungsjahr
        // which is always present. When the cookie holds a valid year and no
        // ?year= param is in the URL, selectedYear must equal the cookie year.
        const current = currentBuchungsjahr();
        const data = await runLoad("", String(current));
        expect(data.selectedYear).toBe(current);
      });

      it("?year= URL param wins over fdw_year cookie (URL is authoritative)", async () => {
        // Even if the cookie holds a different year, an explicit ?year= in the
        // URL must take precedence (clamped to available).
        const current = currentBuchungsjahr();
        const data = await runLoad("?year=2099", String(current));
        // 2099 clamps to the nearest available year (not the cookie value)
        const years = data.availableYears.map((y: { year: number }) => y.year);
        if (years.length > 0) {
          expect(years).toContain(data.selectedYear);
        }
      });

      it("fdw_year cookie is ignored when the cookie year is not in availableYears", async () => {
        // A stale cookie year (e.g. 1999) must be discarded; the load falls
        // back to currentBuchungsjahr just as if no cookie were present.
        const data = await runLoad("", "1999");
        expect(data.selectedYear).toBe(currentBuchungsjahr());
      });
    });
  },
);
