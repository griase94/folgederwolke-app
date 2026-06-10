/**
 * @vitest-environment node
 *
 * Verifies that the seed installs the donation-derivation kategorien required
 * by `deriveDonationKategorieName` (Task 4) and the "Unkategorisiert (Import)"
 * sentinel used by the importer (Task 8) and interim approval path (Task 9).
 *
 * Relies on the RESET lane: `pnpm test --run tests/unit/seed-kategorien.test.ts`
 * — globalSetup resets + migrates + seeds before the test file runs.
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { eq, and } from "drizzle-orm";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

async function exists(kind: string, name: string) {
  const db = getDb();
  const r = await db
    .select({ id: kategorien.id })
    .from(kategorien)
    .where(and(eq(kategorien.kind, kind), eq(kategorien.name, name)))
    .limit(1);
  return r.length === 1;
}

describe.skipIf(!dbConfigured)(
  "seed: donation-derivation + import sentinel",
  () => {
    it("seeds three donation kategorien (income, ideeller)", async () => {
      expect(await exists("income", "Geldspende zweckfrei")).toBe(true);
      expect(await exists("income", "Geldspende zweckgebunden")).toBe(true);
      expect(await exists("income", "Sachspende")).toBe(true);
    });
    it("seeds the import sentinel for both kinds", async () => {
      expect(await exists("expense", "Unkategorisiert (Import)")).toBe(true);
      expect(await exists("income", "Unkategorisiert (Import)")).toBe(true);
    });
  },
);
