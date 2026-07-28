/**
 * Portal home loader — member-scoped "Meine Auslagen" (Aurora A-flow S2a).
 *
 * The security property: the list contains ONLY the session member's own
 * submissions (`bezahlt_von_member_id = self`), never another member's. Runs
 * the REAL /portal/+page.server load against the live DB with two seeded
 * members + a submission each.
 *
 * @vitest-environment node
 * @phase-2
 */

import { describe, it, expect } from "vitest";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";

let seq = 0;

async function seedMember(vorname: string) {
  const db = getDb();
  const [row] = await db
    .insert(members)
    .values({
      vorname,
      nachname: "Scope",
      email: `scope-${Date.now()}-${seq++}@portal.test`,
      eintrittsDatum: "2020-01-01",
      isFixture: true,
    })
    .returning();
  return row!;
}

async function seedSubmission(memberId: string, bezeichnung: string) {
  const db = getDb();
  // AUS-{YYYY}-{NNN} format (business_id_format_ck); high seq avoids collisions.
  const businessId = `AUS-2099-${90001 + seq++}`;
  await db.insert(auslagenSubmissions).values({
    businessId,
    bezeichnung,
    betragCents: 1234n,
    rechnungsdatum: "2026-07-01",
    bezahltVonKind: "member",
    bezahltVonMemberId: memberId,
    bezahltVonDisplay: `Mitglied: ${bezeichnung}`,
    // THE BELEG RULE — a submission needs a Beleg file or a documented Verzicht.
    belegVerzichtGrund: "Fixture ohne Beleg",
    consentTextVersion: "test",
  });
  return businessId;
}

async function loadPortal(memberId: string) {
  const { load } = await import("../../src/routes/portal/+page.server.js");
  const event = {
    locals: {
      session: { user: { id: "u", role: "member_self_service", memberId } },
    },
  };
  return (await load(event as never)) as unknown as {
    auslagen: Array<{ businessId: string; status: string }>;
  };
}

describe("@phase-2 portal home loader scoping", () => {
  it("returns ONLY the session member's own submissions", async () => {
    const anna = await seedMember("Anna");
    const bob = await seedMember("Bob");
    const annaAus = await seedSubmission(anna.id, "Annas Beleg");
    const bobAus = await seedSubmission(bob.id, "Bobs Beleg");

    const res = await loadPortal(anna.id);
    const ids = res.auslagen.map((a) => a.businessId);

    expect(ids).toContain(annaAus);
    expect(ids).not.toContain(bobAus);
  });

  it("derives the status of a fresh (undecided) submission as 'eingegangen'", async () => {
    const carla = await seedMember("Carla");
    const aus = await seedSubmission(carla.id, "Carlas Beleg");

    const res = await loadPortal(carla.id);
    const row = res.auslagen.find((a) => a.businessId === aus);
    expect(row?.status).toBe("eingegangen");
  });
});
