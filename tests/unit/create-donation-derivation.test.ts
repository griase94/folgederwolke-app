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

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDonation } from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { users } from "$lib/server/db/schema/users.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { registerHandlers } from "$lib/server/events/index.js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";

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

    afterAll(async () => {
      if (!ACTOR) return;
      const db = getDb();
      // donations.created_by_user_id is ON DELETE SET NULL — delete explicitly.
      await db.delete(donations).where(eq(donations.createdByUserId, ACTOR));
      // audit_log.actor_user_id is ON DELETE RESTRICT and app_runtime cannot
      // DELETE from audit_log (ADR-0004), so use the superuser connection.
      const admin = postgres(process.env["DIRECT_DATABASE_URL"] ?? "", {
        prepare: false,
        max: 1,
      });
      try {
        await admin`DELETE FROM audit_log WHERE actor_user_id = ${ACTOR}`;
      } finally {
        await admin.end();
      }
      await db.delete(users).where(eq(users.id, ACTOR));
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

// Phase 8 T6 regression guard: createDonation must write EXACTLY ONE
// `donation.created` audit row. Before T6 a parallel `spende.created`
// handler also wrote a `donation`/`create` audit row off the (now-deleted)
// transactions/neu route — this test fails if a second audit writer ever
// re-appears (or if the sole donation.created handler is dropped).
//
// The audit handlers are registered on app startup via hooks.server.ts; in
// unit tests we register them explicitly so the emitted event writes its row.
describe.skipIf(!dbConfigured)(
  "createDonation: emits exactly ONE donation.created audit row",
  () => {
    let AUDIT_ACTOR = "";

    beforeAll(async () => {
      registerHandlers();
      const [u] = await getDb()
        .insert(users)
        .values({
          email: "donation-audit-test@example.com",
          emailCanonical: "donation-audit-test@example.com",
          name: "Donation Audit Test",
        })
        .returning({ id: users.id });
      if (!u) throw new Error("failed to seed audit actor user");
      AUDIT_ACTOR = u.id;
    });

    afterAll(async () => {
      if (!AUDIT_ACTOR) return;
      const db = getDb();
      await db
        .delete(donations)
        .where(eq(donations.createdByUserId, AUDIT_ACTOR));
      const admin = postgres(process.env["DIRECT_DATABASE_URL"] ?? "", {
        prepare: false,
        max: 1,
      });
      try {
        await admin`DELETE FROM audit_log WHERE actor_user_id = ${AUDIT_ACTOR}`;
      } finally {
        await admin.end();
      }
      await db.delete(users).where(eq(users.id, AUDIT_ACTOR));
    });

    it("writes exactly one donation/create audit_log row for the new donation", async () => {
      const businessId = await allocateBusinessId("S", 2026);
      const { id } = await createDonation({
        betragCents: 12345,
        spendeKind: "geldspende",
        zweckbindungKind: "zweckfrei",
        spenderName: "Audit Spender",
        actorUserId: AUDIT_ACTOR,
        businessId,
      });

      const rows = await getDb()
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entityKind, "donation"),
            eq(auditLog.entityId, id),
            eq(auditLog.action, "create"),
          ),
        );

      expect(rows.length).toBe(1);
    });
  },
);
