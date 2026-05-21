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
});
