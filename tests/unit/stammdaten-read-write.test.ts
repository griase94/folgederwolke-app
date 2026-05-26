/**
 * @phase-9
 *
 * Stammdaten domain helper — reads + writes Verein-Stammdaten via the
 * existing `settings` key-value table, falling back to VEREIN_* env vars
 * when no DB row exists yet.
 *
 * Connects as `app_runtime` (test harness identity); the global setup
 * has already migrated + seeded the DB.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import {
  readStammdaten,
  writeStammdaten,
} from "$lib/server/domain/settings-stammdaten.js";
import { getDb } from "$lib/server/db/index.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("Stammdaten read/write", () => {
  // A privileged client for cleanup + seed (the app DB role can't always
  // bypass the audit trigger or RLS-style helpers we don't actually touch
  // here, but using DIRECT keeps the cleanup symmetrical with other tests).
  const direct = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
  const directDb = drizzle(direct);

  beforeEach(async () => {
    await directDb.execute(sql`DELETE FROM settings WHERE key LIKE 'verein.%'`);
  });

  afterAll(async () => {
    await direct.end();
  });

  it("read falls back to env when no settings row", async () => {
    const s = await readStammdaten();
    expect(s.source.name).toBe("env-fallback");
    expect(s.source.iban).toBe("env-fallback");
    expect(s.source.vr).toBe("env-fallback");
    expect(s.source.vorstandIds).toBe("env-fallback");
  });

  it("write then read returns settings value with source=settings", async () => {
    const r = await writeStammdaten(
      { name: "Folge der Wolke e.V." },
      "00000000-0000-0000-0000-000000000001",
    );
    expect(r.ok).toBe(true);

    const s = await readStammdaten();
    expect(s.name).toBe("Folge der Wolke e.V.");
    expect(s.source.name).toBe("settings");
    // Other fields still come from env-fallback (they weren't written).
    expect(s.source.iban).toBe("env-fallback");
  });

  it("rejects invalid IBAN", async () => {
    const r = await writeStammdaten(
      { iban: "DE00 0000 0000 0000 0000 00" },
      "00000000-0000-0000-0000-000000000001",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toContain("iban");
    }
  });

  it("rejects vorstandIds with a non-vorstand member", async () => {
    // Seed a regular member directly via the app DB connection so we can
    // round-trip the id back as a vorstand-candidate (and have writeStammdaten
    // reject it because the role is `mitglied`).
    const db = getDb();
    const rows = (await db.execute<{ id: string }>(sql`
      INSERT INTO members (vorname, nachname, role)
      VALUES ('Test', 'Mitglied', 'mitglied')
      RETURNING id::text
    `)) as { id: string }[];
    const memberId = rows[0]!.id;

    const r = await writeStammdaten(
      { vorstandIds: [memberId] },
      "00000000-0000-0000-0000-000000000001",
    );
    expect(r.ok).toBe(false);

    // Cleanup so the seeded fixture row doesn't leak into other tests.
    await directDb.execute(
      sql`DELETE FROM members WHERE id = ${memberId}::uuid`,
    );
  });

  it("rejects vorstandIds that include an ausgetretenes Mitglied (Blocker A)", async () => {
    // Seed a vorstand member who has already left (austritts_datum in the past).
    const db = getDb();
    const rows = (await db.execute<{ id: string }>(sql`
      INSERT INTO members (vorname, nachname, role, austritts_datum)
      VALUES ('Ausgetreten', 'Vorstand', 'vorstand', current_date - interval '1 day')
      RETURNING id::text
    `)) as { id: string }[];
    const memberId = rows[0]!.id;

    const r = await writeStammdaten(
      { vorstandIds: [memberId] },
      "00000000-0000-0000-0000-000000000001",
    );
    // The member has role=vorstand but is austritted — writeStammdaten should
    // treat them as non-existent (filtered out by austritts_datum check).
    expect(r.ok).toBe(false);

    await directDb.execute(
      sql`DELETE FROM members WHERE id = ${memberId}::uuid`,
    );
  });

  it("write empty string → reader returns env-fallback value with source:env-fallback (Blocker C)", async () => {
    // First write a real value so there is a settings row.
    const r1 = await writeStammdaten(
      { name: "Echter Name e.V." },
      "00000000-0000-0000-0000-000000000001",
    );
    expect(r1.ok).toBe(true);
    const s1 = await readStammdaten();
    expect(s1.name).toBe("Echter Name e.V.");
    expect(s1.source.name).toBe("settings");

    // Now write an empty string — should be a no-op (no upsert).
    const r2 = await writeStammdaten(
      { name: "" },
      "00000000-0000-0000-0000-000000000001",
    );
    expect(r2.ok).toBe(true);

    // The settings row from the first write must still be present — the
    // empty-string write must NOT have overwritten it with "".
    // (beforeEach deleted all verein.* rows, so the only source is our
    // first write above.)
    const s2 = await readStammdaten();
    expect(s2.name).toBe("Echter Name e.V.");
    expect(s2.source.name).toBe("settings");

    // Second scenario: fresh DB (no prior write). Write "" → env-fallback.
    await directDb.execute(sql`DELETE FROM settings WHERE key LIKE 'verein.%'`);
    const r3 = await writeStammdaten(
      { name: "" },
      "00000000-0000-0000-0000-000000000001",
    );
    expect(r3.ok).toBe(true);
    const s3 = await readStammdaten();
    expect(s3.source.name).toBe("env-fallback");
  });

  it("rejects IBAN/BIC mismatch for known DE BLZ (Blocker B)", async () => {
    // Deutsche Skatbank BLZ 83065408 → expected BIC prefix GENODEF1.
    // Supplying a different BIC should be caught by assertVereinBankConsistent.
    const skatbankIban = "DE86830654080004822200"; // valid MOD-97, BLZ=83065408
    const wrongBic = "BELADEBEXXX"; // Berliner Sparkasse — wrong bank entirely

    const r = await writeStammdaten(
      { iban: skatbankIban, bic: wrongBic },
      "00000000-0000-0000-0000-000000000001",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toMatch(/iban|bic|mismatch|blz|bank/i);
    }
  });
});
