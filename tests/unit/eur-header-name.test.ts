/**
 * White-label Phase 1 — EÜR header sources the Verein name from settings
 * (readStammdaten) instead of the hardcoded `env.VEREIN_NAME || "Folge der
 * Wolke e.V."` fallback. With a `verein.name` row in settings, the EÜR
 * aggregate must surface that value.
 */

import { afterEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { loadEurAggregatesForPdf } from "$lib/server/eur/load.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("EÜR header name source", () => {
  const direct = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
  const directDb = drizzle(direct);

  afterEach(async () => {
    await directDb.execute(sql`DELETE FROM settings WHERE key = 'verein.name'`);
    await direct.end();
  });

  it("uses the settings verein.name, not a hardcoded FdW literal", async () => {
    await directDb.execute(
      sql`INSERT INTO settings (key, value) VALUES ('verein.name', '"Verein X e.V."'::jsonb)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    const agg = await loadEurAggregatesForPdf(2025);
    expect(agg.vereinName).toBe("Verein X e.V.");
  });
});
