/**
 * The ONE member-IBAN write path (Aurora A-flow S2b.0).
 *
 * DB-backed: exercises `updateMemberIban` (normalize + validate + write +
 * in-tx audit anchor) against the live test DB — the shared helper the
 * Willkommens-Karte, the Fall-B/C submit arm, and the Profil inline-edit all
 * funnel through.
 *
 * @vitest-environment node
 * @phase-2
 */

import { describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import {
  updateMemberIban,
  InvalidIbanError,
} from "$lib/server/domain/member-iban.js";

let seq = 0;
async function seedMember(iban: string | null = null) {
  const [row] = await getDb()
    .insert(members)
    .values({
      vorname: "Iban",
      nachname: "Test",
      email: `iban-${Date.now()}-${seq++}@portal.test`,
      iban,
      eintrittsDatum: "2020-01-01",
      isFixture: true,
    })
    .returning();
  return row!;
}

describe("@phase-2 updateMemberIban — the one write path", () => {
  it("normalizes + writes members.iban and leaves an audit anchor", async () => {
    const m = await seedMember(null);
    const res = await updateMemberIban(
      {
        memberId: m.id,
        rawIban: "de89 3704 0044 0532 0130 00", // lowercase + spaces
        actorUserId: null,
        source: "profil",
      },
      getDb(),
    );
    // Normalized (uppercase, no spaces).
    expect(res.iban).toBe("DE89370400440532013000");

    const [after] = await getDb()
      .select({ iban: members.iban })
      .from(members)
      .where(eq(members.id, m.id));
    expect(after!.iban).toBe("DE89370400440532013000");

    const audit = (await getDb().execute(sql`
      SELECT 1 FROM audit_log
       WHERE entity_kind = 'member' AND entity_id = ${m.id}::uuid
         AND payload->>'kind' = 'iban_updated'
         AND payload->>'source' = 'profil'
       LIMIT 1
    `)) as unknown as unknown[];
    expect(audit.length).toBe(1);
  });

  it("throws InvalidIbanError on a bad checksum and writes nothing", async () => {
    const m = await seedMember("DE89370400440532013000");
    await expect(
      updateMemberIban(
        {
          memberId: m.id,
          rawIban: "DE00 0000 0000 0000 0000 00", // invalid checksum
          actorUserId: null,
          source: "onboarding_card",
        },
        getDb(),
      ),
    ).rejects.toBeInstanceOf(InvalidIbanError);

    // Unchanged — the validate gate runs before any write.
    const [after] = await getDb()
      .select({ iban: members.iban })
      .from(members)
      .where(eq(members.id, m.id));
    expect(after!.iban).toBe("DE89370400440532013000");
  });
});
