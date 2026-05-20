/**
 * C2 — /app/+layout.server.ts must expose four year-context fields to every page:
 *   - availableYears: AvailableYear[]     — the switcher's dropdown options
 *   - selectedYear: number                — selected via ?year=NNNN with fallback
 *   - currentYear: number                 — Berlin-TZ current Buchungsjahr
 *   - festgeschriebenBis: number | null   — for downstream gate checks
 *
 * Resolves: JB-001 (yearly filters), JB-006 (?year ignored).
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { load as layoutLoad } from "../../src/routes/app/+layout.server.js";
import { currentBuchungsjahr } from "$lib/domain/year.js";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

// Layout return type — pulled out to keep test bodies tidy and avoid
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

describe.skipIf(!url)("C2 /app layout year context (JB-001/JB-006)", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(() => {
    sql = postgres(url, { prepare: false, max: 1 });
  });

  afterEach(async () => {
    await sql`DELETE FROM settings WHERE key = 'festgeschrieben_bis'`;
  });

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
