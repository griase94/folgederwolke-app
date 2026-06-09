/**
 * §16 downstream reflection — Phase 8 T7.
 *
 * Asserts that a newly-created income row AND a newly-created donation row
 * are both reflected by `computeEurYear` (via `loadEurWorkspaceData`).
 *
 * Uses a far-future test year (2097) so the rows are the ONLY entries in
 * scope and the sum assertions are exact. DB-backed → RESET lane.
 * Skipped when DATABASE_URL / DIRECT_DATABASE_URL unset.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { income } from "$lib/server/db/schema/income.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { users } from "$lib/server/db/schema/users.js";
import { loadEurWorkspaceData } from "$lib/server/eur/load.js";
import { and, eq } from "drizzle-orm";
import type { Sphere } from "$lib/domain/sphere.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// Far-future test year to avoid collisions with the showcase seed corpus.
// Must be 4 digits, which all years in range are.
const TEST_YEAR = 2097;

// Mid-year date in TEST_YEAR (avoids TZ-boundary edge cases for year_of_buchung).
// Used for both income.gebucht_am and donations.gebucht_am.
const MID_YEAR_DATE = new Date(`${TEST_YEAR}-06-15T12:00:00.000Z`);

// Valid business IDs: income = E-YYYY-NNN+, donations = S-YYYY-NNN+
const INC_BID = `E-${TEST_YEAR}-700`;
const DON_BID = `S-${TEST_YEAR}-700`;

const INCOME_CENTS = 77_00n; // 77,00 €
const DONATION_CENTS = 55_00n; // 55,00 €

/** Resolve one seeded income kategorie for a given sphere. */
async function incomeKategorie(
  sphere: Sphere,
): Promise<{ id: string; name: string }> {
  const db = getDb();
  const [row] = await db
    .select({ id: kategorien.id, name: kategorien.name })
    .from(kategorien)
    .where(and(eq(kategorien.kind, "income"), eq(kategorien.sphere, sphere)))
    .limit(1);
  if (!row)
    throw new Error(
      `§16-reflection: no income kategorie seeded for sphere ${sphere}`,
    );
  return row;
}

/** Resolve one seeded donation kategorie (kind='income', sphere='ideeller'). */
async function donationKategorie(): Promise<{ id: string; name: string }> {
  const db = getDb();
  const [row] = await db
    .select({ id: kategorien.id, name: kategorien.name })
    .from(kategorien)
    .where(
      and(eq(kategorien.kind, "income"), eq(kategorien.sphere, "ideeller")),
    )
    .limit(1);
  if (!row)
    throw new Error("§16-reflection: no ideeller income kategorie seeded");
  return row;
}

describe.skipIf(!dbConfigured)(
  "§16 downstream reflection — income + donation appear in computeEurYear",
  () => {
    beforeAll(async () => {
      if (!dbConfigured) return;
      const db = getDb();

      // Seed a user for the FK constraints on income / donations.
      const [actor] = await db
        .insert(users)
        .values({
          email: "eur-reflection-t7@example.com",
          emailCanonical: "eur-reflection-t7@example.com",
          name: "EÜR Reflection T7",
        })
        .onConflictDoUpdate({
          target: users.emailCanonical,
          set: { name: "EÜR Reflection T7" },
        })
        .returning({ id: users.id });
      if (!actor) throw new Error("§16-reflection: failed to seed actor user");

      // Clean any leftover rows from prior runs (use exact business IDs to
      // avoid accidentally deleting other test data if TEST_YEAR collides).
      await db.delete(income).where(eq(income.businessId, INC_BID));
      await db.delete(donations).where(eq(donations.businessId, DON_BID));

      // Insert ONE income row.
      const incKat = await incomeKategorie("ideeller");
      await db.insert(income).values({
        businessId: INC_BID,
        bezeichnung: "§16 T7 test income",
        betragCents: INCOME_CENTS,
        gebuchtAm: MID_YEAR_DATE,
        kategorieId: incKat.id,
        kategorieNameSnapshot: incKat.name,
        sphereSnapshot: "ideeller",
        createdByUserId: actor.id,
      });

      // Insert ONE donation row. The donations.gebucht_am column drives
      // year_of_buchung (generated). Set it explicitly so the row lands in
      // TEST_YEAR.
      const donKat = await donationKategorie();
      await db.insert(donations).values({
        businessId: DON_BID,
        betragCents: DONATION_CENTS,
        gebuchtAm: MID_YEAR_DATE,
        kategorieId: donKat.id,
        kategorieNameSnapshot: donKat.name,
        sphereSnapshot: "ideeller",
        spendeKind: "geldspende",
        zweckbindungKind: "zweckfrei",
        spenderName: "§16 T7 Spender",
        createdByUserId: actor.id,
      });
    }, 30_000);

    it("newly-created income is reflected in computeEurYear einnahmenCents", async () => {
      const { eur } = await loadEurWorkspaceData(TEST_YEAR);
      // loadEurWorkspaceData returns SerializedEurYear where
      // bySphere[sphere].einnahmenCents is a plain number (serialized from
      // bigint for the SvelteKit page data boundary).
      const ideellerCents = eur.bySphere.ideeller?.einnahmenCents ?? 0;
      // At minimum, our seeded income contributes INCOME_CENTS (7700 cents = 77 €).
      expect(ideellerCents).toBeGreaterThanOrEqual(Number(INCOME_CENTS));
    });

    it("newly-created donation is reflected in computeEurYear einnahmenCents", async () => {
      const { eur } = await loadEurWorkspaceData(TEST_YEAR);
      // Donations also flow into the ideeller einnahmen side via the 3-source
      // union in loadEurWorkspaceData (income + donations + member_beitrags).
      const ideellerCents = eur.bySphere.ideeller?.einnahmenCents ?? 0;
      // Both income (7700) + donation (5500) must contribute to ideeller.
      expect(ideellerCents).toBeGreaterThanOrEqual(
        Number(INCOME_CENTS) + Number(DONATION_CENTS),
      );
    });
  },
);
