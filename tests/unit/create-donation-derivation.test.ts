/**
 * @vitest-environment node
 *
 * Verifies that `createDonation` DERIVES its Kategorie + sphere from
 * (spendeKind, zweckbindungKind) — overriding any caller-supplied snapshot —
 * and persists the Sachspende Wertermittlung fields (spec §4.3-4.5).
 *
 * Relies on the RESET lane:
 *   pnpm test --run tests/unit/create-donation-derivation.test.ts
 * — globalSetup resets + migrates + seeds before this file runs (the seeded
 *   income kategorien "Geldspende zweckgebunden" / "Sachspende" must exist).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createDonation } from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { users } from "$lib/server/db/schema/users.js";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// donations.created_by_user_id is an FK → users.id, so we seed a real actor.
let ACTOR = "";

describe.skipIf(!dbConfigured)(
  "createDonation: derive kategorie + sphere",
  () => {
    beforeAll(async () => {
      const [u] = await getDb()
        .insert(users)
        .values({
          email: "donation-derivation-test@example.com",
          emailCanonical: "donation-derivation-test@example.com",
          name: "Donation Derivation Test",
        })
        .returning({ id: users.id });
      if (!u) throw new Error("failed to seed actor user");
      ACTOR = u.id;
    });
    it("zweckgebunden Geldspende → 'Geldspende zweckgebunden', ideeller, kategorie_id set", async () => {
      const businessId = await allocateBusinessId("S", 2026);
      const { id } = await createDonation({
        betragCents: 25000,
        spendeKind: "geldspende",
        zweckbindungKind: "zweckgebunden",
        zweckbindungText: "Notenständer",
        spenderName: "Test Spender",
        actorUserId: ACTOR,
        businessId,
      });

      const [row] = await getDb()
        .select()
        .from(donations)
        .where(eq(donations.id, id))
        .limit(1);

      expect(row).toBeDefined();
      if (!row) throw new Error("donation row not found");
      expect(row.kategorieNameSnapshot).toBe("Geldspende zweckgebunden");
      expect(row.sphereSnapshot).toBe("ideeller");
      expect(row.kategorieId).not.toBeNull();
    });

    it("Sachspende persists Wertermittlung + betriebsvermoegen, derives 'Sachspende'", async () => {
      const businessId = await allocateBusinessId("S", 2026);
      const { id } = await createDonation({
        betragCents: 30000,
        spendeKind: "sachspende",
        wertermittlungMethode: "marktpreis",
        zustandBeschreibung: "Beamer Epson, gebraucht",
        betriebsvermoegen: true,
        spenderName: "Test Spender",
        actorUserId: ACTOR,
        businessId,
      });

      const [row] = await getDb()
        .select()
        .from(donations)
        .where(eq(donations.id, id))
        .limit(1);

      expect(row).toBeDefined();
      if (!row) throw new Error("donation row not found");
      expect(row.kategorieNameSnapshot).toBe("Sachspende");
      expect(row.sphereSnapshot).toBe("ideeller");
      expect(row.kategorieId).not.toBeNull();
      expect(row.wertermittlungMethode).toBe("marktpreis");
      expect(row.zustandBeschreibung).toBe("Beamer Epson, gebraucht");
      expect(row.betriebsvermoegen).toBe(true);
    });
  },
);
