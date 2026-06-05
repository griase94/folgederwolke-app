/**
 * Phase 6 / Task 4 — createSpende/editSpende delegate to createDonation.
 *
 * The dual-path reconciliation: spenden.ts keeps its rich Zod validation but
 *   - DROPS the UI-supplied kategorie_id + the ADR-0008 project sphere-override
 *     branch (§4.5: donation sphere is ALWAYS ideeller, never the project
 *     default),
 *   - DELEGATES the insert to createDonation (Phase 1) which derives
 *     kategorieName/id + sphere='ideeller' from (spendeKind, zweckbindungKind),
 *   - writes Sachspende facts to the real §4.3 columns (wertermittlungMethode /
 *     zustandBeschreibung / herkunftsbelegFileId) instead of a "Sache:" string.
 *
 * DB-backed → RESET lane. Skipped when DATABASE_URL/DIRECT_DATABASE_URL unset.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createSpende, editSpende } from "$lib/server/domain/spenden.js";
import { getTransactionDetail } from "$lib/server/domain/transactions.js";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { users } from "$lib/server/db/schema/users.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

// donations.created_by_user_id is an FK → users.id, so we seed a real actor.
let ACTOR = "";

async function wirtschaftlichProjectId(): Promise<string> {
  const db = getDb();
  // Seeded P-2026-002 has sphere_default = 'wirtschaftlich' (scripts/seed-fixtures).
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.businessId, "P-2026-002"))
    .limit(1);
  if (!row) throw new Error("seeded wirtschaftlich project P-2026-002 missing");
  return row.id;
}

describe.skipIf(!dbConfigured)(
  "createSpende delegates to createDonation (derived kategorie + sphere)",
  () => {
    beforeAll(async () => {
      const [u] = await getDb()
        .insert(users)
        .values({
          email: "spenden-reconcile-test@example.com",
          emailCanonical: "spenden-reconcile-test@example.com",
          name: "Spenden Reconcile Test",
        })
        .returning({ id: users.id });
      if (!u) throw new Error("failed to seed actor user");
      ACTOR = u.id;
    });

    it("Geldspende zweckfrei → sphere ideeller + derived Kategorie, no UI kategorie_id needed", async () => {
      const r = await createSpende(
        {
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckfrei",
          zugewendet_am: "2026-03-01",
          betragCents: "5000",
          spender_name: "Erika Externe",
          spender_adresse: "Hauptstr. 1, 10115 Berlin",
          // NOTE: no kategorie_id supplied — it is derived server-side now.
        },
        ACTOR,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const d = await getTransactionDetail(r.donationId, "donation");
      expect(d!.sphereSnapshot).toBe("ideeller");
      expect(d!.kategorieNameSnapshot).toBe("Geldspende zweckfrei");
    });

    it("project with a non-ideeller sphere_default does NOT change the booking sphere (§4.5)", async () => {
      const r = await createSpende(
        {
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckgebunden",
          zweckbindung_text: "Festival 2026",
          zugewendet_am: "2026-03-02",
          betragCents: "9000",
          spender_name: "Max Mustermann",
          spender_adresse: "Weg 2, 10117 Berlin",
          project_id: await wirtschaftlichProjectId(),
        },
        ACTOR,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const d = await getTransactionDetail(r.donationId, "donation");
      expect(d!.sphereSnapshot).toBe("ideeller"); // NOT wirtschaftlich
      expect(d!.projectId).not.toBeNull();
    });

    it("Sachspende writes Wertermittlung to the real columns, not the 'Sache:' string", async () => {
      const r = await createSpende(
        {
          spende_kind: "sachspende",
          zweckbindung_kind: "zweckfrei",
          zugewendet_am: "2026-03-03",
          betragCents: "12000", // gemeiner Wert (§9 BewG)
          spender_name: "Sach Spender",
          spender_adresse: "Gasse 3, 10119 Berlin",
          wertermittlung_methode: "marktpreis",
          zustand_beschreibung: "Gebraucht, gut erhalten",
        },
        ACTOR,
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const d = await getTransactionDetail(r.donationId, "donation");
      expect(d!.wertermittlungMethode).toBe("marktpreis");
      expect(d!.zustandBeschreibung).toBe("Gebraucht, gut erhalten");
      expect(d!.kategorieNameSnapshot).toBe("Sachspende");
      expect(d!.zweckbindungText ?? "").not.toContain("Sache:");
    });

    it("still rejects Aufwandsspende + missing spender identity (validation kept)", async () => {
      const a = await createSpende({ spende_kind: "aufwandsspende" }, ACTOR);
      expect(a.ok).toBe(false);
      const b = await createSpende(
        {
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckfrei",
          betragCents: "100",
          zugewendet_am: "2026-01-01",
        },
        ACTOR,
      );
      expect(b.ok).toBe(false); // no member_id and no name+adresse
    });

    it("editSpende re-derives Kategorie on a Zweckbindung change, sphere stays ideeller", async () => {
      // Create zweckfrei, then flip to zweckgebunden → kategorieNameSnapshot must
      // re-derive to "Geldspende zweckgebunden" AND sphere must remain ideeller.
      const created = await createSpende(
        {
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckfrei",
          zugewendet_am: "2026-04-01",
          betragCents: "7000",
          spender_name: "Wandel Spender",
          spender_adresse: "Allee 4, 10119 Berlin",
        },
        ACTOR,
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const edit = await editSpende(
        {
          id: created.donationId,
          spende_kind: "geldspende",
          zweckbindung_kind: "zweckgebunden",
          zweckbindung_text: "Für die Nachwuchsförderung",
          zugewendet_am: "2026-04-01",
          betragCents: "7000",
          spender_name: "Wandel Spender",
          spender_adresse: "Allee 4, 10119 Berlin",
        },
        ACTOR,
      );
      expect(edit.ok).toBe(true);

      const d = await getTransactionDetail(created.donationId, "donation");
      expect(d!.kategorieNameSnapshot).toBe("Geldspende zweckgebunden");
      expect(d!.sphereSnapshot).toBe("ideeller");
      expect(d!.zweckbindungText).toBe("Für die Nachwuchsförderung");
    });
  },
);
