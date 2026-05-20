/**
 * @vitest-environment node
 * @phase-2
 *
 * C1 cycle 2 — C1-H4 — real PDF + CSV endpoints separate from bundle.zip.
 *
 * Before this fix, both quick-action buttons (PDF + CSV) pointed at the
 * same bundle.zip endpoint, contradicting JB-007 (one-pager PDF separate
 * from the ZIP).
 *
 * These tests assert:
 *   - GET /app/jahresabschluss/[year]/eur.pdf → application/pdf body
 *   - GET /app/jahresabschluss/[year]/transactions.csv → text/csv body
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("C1-H4 — real PDF + CSV endpoints", () => {
  let sql: ReturnType<typeof postgres>;
  const YEAR = 2029;
  const INC_BID = `E-${YEAR}-730101`;

  beforeAll(async () => {
    sql = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    const [k] = await sql<
      { id: string; name: string }[]
    >`SELECT id, name FROM kategorien WHERE kind='income' AND sphere='ideeller' LIMIT 1`;
    if (!k) throw new Error("c1-endpoints: missing ideeller kategorie");
    await sql`
      INSERT INTO income (
        business_id, gebucht_am, betrag_cents, bezeichnung,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot
      ) VALUES (
        ${INC_BID},
        ${`${YEAR}-06-01 10:00:00+01`},
        77777,
        'c1 endpoint income',
        ${k.id},
        ${k.name},
        'ideeller'
      )
    `;
  }, 30_000);

  afterAll(async () => {
    await sql`DELETE FROM income WHERE business_id = ${INC_BID}`;
    await sql.end();
  });

  it("eur.pdf endpoint returns Content-Type: application/pdf with non-empty body", async () => {
    // Dynamic import so the route's module-level code only runs in DB-bound
    // contexts.
    const mod = await import(
      "../../src/routes/app/jahresabschluss/[year]/eur.pdf/+server.ts"
    );
    const handler = mod.GET;
    expect(typeof handler).toBe("function");

    // SvelteKit passes a partial event; the route only reads params.year.
    const event = {
      params: { year: String(YEAR) },
    } as unknown as Parameters<typeof handler>[0];
    const res = await handler(event);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(200);
    // PDF magic bytes "%PDF"
    const head = new Uint8Array(buf.slice(0, 4));
    expect(Array.from(head)).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  it("transactions.csv endpoint returns Content-Type: text/csv with BOM + header", async () => {
    const mod = await import(
      "../../src/routes/app/jahresabschluss/[year]/transactions.csv/+server.ts"
    );
    const handler = mod.GET;
    expect(typeof handler).toBe("function");

    const event = {
      params: { year: String(YEAR) },
    } as unknown as Parameters<typeof handler>[0];
    const res = await handler(event);
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    // Use arrayBuffer so the BOM is preserved (TextDecoder defaults to
    // stripping it).
    const buf = new Uint8Array(await res.arrayBuffer());
    // UTF-8 BOM = 0xEF 0xBB 0xBF
    expect(Array.from(buf.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8").decode(buf);
    expect(text).toMatch(/Datum;Buchung-Nr;Bezeichnung/);
    // Our seeded row should be present
    expect(text).toContain(INC_BID);
  });

  it("eur.pdf rejects out-of-range years with 400", async () => {
    const mod = await import(
      "../../src/routes/app/jahresabschluss/[year]/eur.pdf/+server.ts"
    );
    const handler = mod.GET;
    const event = {
      params: { year: "1999" },
    } as unknown as Parameters<typeof handler>[0];
    await expect(handler(event)).rejects.toMatchObject({ status: 400 });
  });
});
