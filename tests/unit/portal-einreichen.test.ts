/**
 * Member Auslage submit + detail (Aurora A-flow S2b).
 *
 * Runs the REAL /portal/auslagen/neu action and /portal/auslagen/[ausId] load
 * against the live DB, with a stubbed FileStorage so no bytes leave the box.
 *
 * The properties under test are the money- and privacy-critical ones:
 *  - Fall A snapshots the STORED IBAN and writes nothing back to the profile,
 *  - Fall B/C snapshot the TYPED IBAN, and only touch the profile when asked,
 *  - the submitter is always the session member — a payload cannot name one,
 *  - a Beleg-Verzicht needs a reason (members only),
 *  - another member's AUS-Nr is a 404, not a 403,
 *  - no response ever carries a full IBAN.
 *
 * @vitest-environment node
 * @phase-2
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { users } from "$lib/server/db/schema/users.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { registerHandlers } from "$lib/server/events/index.js";

const STORED_IBAN = "DE89370400440532013000";
const TYPED_IBAN = "DE12500105170648489890";
const OTHER_IBAN = "AT611904300234573201";

let seq = 0;
const uuid = () => crypto.randomUUID();

/** A FileStorage stub — the pipeline must not touch Blob or the filesystem. */
const storageStub = {
  upload: async () => ({
    pathname: `test/${uuid()}`,
    url: "https://example.invalid/x",
    sha256: uuid().replace(/-/g, ""),
    sizeBytes: 4,
  }),
  download: async () => new Uint8Array([1, 2, 3, 4]),
  archive: async () => {},
  head: async () => null,
} as unknown as Parameters<
  typeof import("../../src/routes/portal/auslagen/neu/+page.server.js")._setFileStorageOverride
>[0];

beforeAll(async () => {
  // The submit emits `auslagen.submitted`; without handlers the bus would warn.
  registerHandlers();
  const mod =
    await import("../../src/routes/portal/auslagen/neu/+page.server.js");
  mod._setFileStorageOverride(storageStub);
});

afterAll(async () => {
  const mod =
    await import("../../src/routes/portal/auslagen/neu/+page.server.js");
  mod._setFileStorageOverride(undefined);
});

async function seedMemberWithUser(iban: string | null) {
  const db = getDb();
  const stamp = `${Date.now()}-${seq++}`;
  const [member] = await db
    .insert(members)
    .values({
      vorname: "Ein",
      nachname: `Reicher${seq}`,
      email: `einreichen-${stamp}@portal.test`,
      eintrittsDatum: "2020-01-01",
      iban,
      isFixture: true,
    })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `einreichen-user-${stamp}@portal.test`,
      emailCanonical: `einreichen-user-${stamp}@portal.test`,
      role: "member_self_service",
      memberId: member!.id,
    })
    .returning();
  return { member: member!, user: user! };
}

interface ItemInput {
  bezeichnung?: string;
  betrag_cents?: number;
  beleg_mode?: "file" | "verzicht";
  beleg_verzicht_grund?: string | null;
}

function buildForm(
  items: ItemInput[],
  erstattung?: { iban?: string; save_to_profile?: boolean },
) {
  const form = new FormData();
  const auslagen = items.map((it, i) => ({
    client_key: `k${i}`,
    submission_nonce: uuid(),
    bezeichnung: it.bezeichnung ?? "Getränke fürs Sommerfest",
    kommentar: null,
    rechnungsdatum: "2026-07-01",
    betrag_cents: it.betrag_cents ?? 2490,
    wofuer: null,
    beleg_mode: it.beleg_mode ?? "verzicht",
    beleg_verzicht_grund:
      (it.beleg_mode ?? "verzicht") === "verzicht"
        ? (it.beleg_verzicht_grund ?? "Bon ist im Regen zerlaufen.")
        : null,
  }));
  form.set(
    "data",
    JSON.stringify({ ...(erstattung ? { erstattung } : {}), auslagen }),
  );
  items.forEach((it, i) => {
    if ((it.beleg_mode ?? "verzicht") === "file") {
      form.set(
        `beleg_${i}`,
        new File(
          [Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])],
          "bon.jpg",
          {
            type: "image/jpeg",
          },
        ),
      );
    }
  });
  return form;
}

async function submit(
  userId: string,
  memberId: string,
  form: FormData,
): Promise<Record<string, unknown>> {
  const mod =
    await import("../../src/routes/portal/auslagen/neu/+page.server.js");
  const event = {
    locals: {
      session: { user: { id: userId, role: "member_self_service", memberId } },
    },
    request: {
      headers: new Headers({ "content-length": "1000" }),
      formData: async () => form,
    },
  };
  return (await mod.actions.default!(event as never)) as Record<
    string,
    unknown
  >;
}

async function readSubmission(businessId: string) {
  const [row] = await getDb()
    .select({
      erstattungIban: auslagenSubmissions.erstattungIban,
      bezahltVonKind: auslagenSubmissions.bezahltVonKind,
      bezahltVonMemberId: auslagenSubmissions.bezahltVonMemberId,
      belegVerzichtGrund: auslagenSubmissions.belegVerzichtGrund,
      belegFileId: auslagenSubmissions.belegFileId,
      submissionGroupId: auslagenSubmissions.submissionGroupId,
      betragCents: auslagenSubmissions.betragCents,
    })
    .from(auslagenSubmissions)
    .where(eq(auslagenSubmissions.businessId, businessId));
  return row!;
}

async function readMemberIban(memberId: string) {
  const [row] = await getDb()
    .select({ iban: members.iban })
    .from(members)
    .where(eq(members.id, memberId));
  return row?.iban ?? null;
}

function handoffOf(res: Record<string, unknown>) {
  return res.handoff as {
    items: { ausId: string; betragCents: number }[];
    gesamtCents: number;
    statusHref: string;
  };
}

describe("@phase-2 member submit — the A/B/C payout matrix", () => {
  it("Fall A: snapshots the STORED IBAN and leaves the profile untouched", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);

    const res = await submit(user.id, member.id, buildForm([{}]));
    const handoff = handoffOf(res);
    expect(handoff.items).toHaveLength(1);

    const row = await readSubmission(handoff.items[0]!.ausId);
    expect(row.erstattungIban).toBe(STORED_IBAN);
    expect(row.bezahltVonKind).toBe("member");
    expect(row.bezahltVonMemberId).toBe(member.id);
    // No IBAN travelled in either direction.
    expect(JSON.stringify(res)).not.toContain(STORED_IBAN);
    expect(await readMemberIban(member.id)).toBe(STORED_IBAN);
  });

  it("Fall B: an entered IBAN is snapshotted AND saved when asked", async () => {
    const { member, user } = await seedMemberWithUser(null);

    const res = await submit(
      user.id,
      member.id,
      buildForm([{}], {
        iban: "DE12 5001 0517 0648 4898 90",
        save_to_profile: true,
      }),
    );

    const row = await readSubmission(handoffOf(res).items[0]!.ausId);
    expect(row.erstattungIban).toBe(TYPED_IBAN);
    expect(await readMemberIban(member.id)).toBe(TYPED_IBAN);
  });

  it("Fall B: without the checkbox the profile stays empty", async () => {
    const { member, user } = await seedMemberWithUser(null);

    const res = await submit(
      user.id,
      member.id,
      buildForm([{}], { iban: TYPED_IBAN, save_to_profile: false }),
    );

    const row = await readSubmission(handoffOf(res).items[0]!.ausId);
    expect(row.erstattungIban).toBe(TYPED_IBAN);
    expect(await readMemberIban(member.id)).toBeNull();
  });

  it("Fall B: no IBAN anywhere is a 422 — no reimbursement without one (§7)", async () => {
    const { member, user } = await seedMemberWithUser(null);

    const res = (await submit(
      user.id,
      member.id,
      buildForm([{}]),
    )) as unknown as {
      status: number;
      data: { erstattungErrors: Record<string, string[]> };
    };

    expect(res.status).toBe(422);
    expect(res.data.erstattungErrors.iban?.[0]).toMatch(/Fehlt noch/);
  });

  it("Fall C: a one-off IBAN does NOT overwrite the stored account", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);

    const res = await submit(
      user.id,
      member.id,
      buildForm([{}], { iban: OTHER_IBAN, save_to_profile: false }),
    );

    const row = await readSubmission(handoffOf(res).items[0]!.ausId);
    expect(row.erstattungIban).toBe(OTHER_IBAN);
    expect(await readMemberIban(member.id)).toBe(STORED_IBAN);
  });

  it("Fall C: opting in DOES replace the stored account", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);

    await submit(
      user.id,
      member.id,
      buildForm([{}], { iban: OTHER_IBAN, save_to_profile: true }),
    );

    expect(await readMemberIban(member.id)).toBe(OTHER_IBAN);
  });

  it("rejects an invalid IBAN before anything is written", async () => {
    const { member, user } = await seedMemberWithUser(null);

    const res = (await submit(
      user.id,
      member.id,
      buildForm([{}], {
        iban: "DE44 5001 0517 5407 3249 9",
        save_to_profile: true,
      }),
    )) as unknown as {
      status: number;
      data: { erstattungErrors: Record<string, string[]> };
    };

    expect(res.status).toBe(422);
    expect(res.data.erstattungErrors.iban?.[0]).toMatch(/keine gültige IBAN/);
    expect(await readMemberIban(member.id)).toBeNull();
  });
});

describe("@phase-2 member submit — Beleg, batch, identity", () => {
  it("accepts a documented Verzicht (members only) and stores the reason", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);

    const res = await submit(
      user.id,
      member.id,
      buildForm([
        {
          beleg_mode: "verzicht",
          beleg_verzicht_grund: "Bon verloren gegangen.",
        },
      ]),
    );

    const row = await readSubmission(handoffOf(res).items[0]!.ausId);
    expect(row.belegVerzichtGrund).toBe("Bon verloren gegangen.");
    expect(row.belegFileId).toBeNull();
  });

  it("refuses a Verzicht without a real reason", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);

    const res = (await submit(
      user.id,
      member.id,
      buildForm([{ beleg_mode: "verzicht", beleg_verzicht_grund: "hm" }]),
    )) as unknown as {
      status: number;
      data: { itemErrors: Record<string, Record<string, string[]>> };
    };

    expect(res.status).toBe(422);
    expect(res.data.itemErrors.k0?.beleg_verzicht_grund?.[0]).toMatch(
      /mindestens 5 Zeichen/,
    );
  });

  it("uploads a Beleg file and links it to the row", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);

    const res = await submit(
      user.id,
      member.id,
      buildForm([{ beleg_mode: "file" }]),
    );

    const row = await readSubmission(handoffOf(res).items[0]!.ausId);
    expect(row.belegFileId).not.toBeNull();
    expect(row.belegVerzichtGrund).toBeNull();
  });

  it("gives every Auslage of a batch its own number under ONE group", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);

    const res = await submit(
      user.id,
      member.id,
      buildForm([
        { bezeichnung: "Kuchen fürs Fest", betrag_cents: 2490 },
        { bezeichnung: "Standmiete Flohmarkt", betrag_cents: 1490 },
        { bezeichnung: "Zutaten", betrag_cents: 2390 },
      ]),
    );

    const handoff = handoffOf(res);
    expect(handoff.items).toHaveLength(3);
    expect(new Set(handoff.items.map((i) => i.ausId)).size).toBe(3);
    expect(handoff.gesamtCents).toBe(6370);

    const rows = await Promise.all(
      handoff.items.map((i) => readSubmission(i.ausId)),
    );
    const groups = new Set(rows.map((r) => r.submissionGroupId));
    expect(groups.size).toBe(1);
    expect([...groups][0]).not.toBeNull();
  });

  it("ignores a member_id smuggled into the payload", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);
    const victim = await seedMemberWithUser(STORED_IBAN);

    const form = buildForm([{}]);
    const payload = JSON.parse(String(form.get("data")));
    // A payload may not name its own submitter (§7-2).
    payload.member_id = victim.member.id;
    payload.auslagen[0].bezahlt_von_member_id = victim.member.id;
    form.set("data", JSON.stringify(payload));

    const res = (await submit(user.id, member.id, form)) as unknown as {
      status?: number;
      handoff?: { items: { ausId: string }[] };
    };

    if (res.status === 422) {
      // A strict schema rejecting the unknown key is an equally correct answer.
      expect(res.status).toBe(422);
      return;
    }
    const row = await readSubmission(res.handoff!.items[0]!.ausId);
    expect(row.bezahltVonMemberId).toBe(member.id);
    expect(row.bezahltVonMemberId).not.toBe(victim.member.id);
  });

  it("is idempotent: replaying the same nonces creates nothing new", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);
    const form = buildForm([{}]);

    const first = handoffOf(await submit(user.id, member.id, form));
    const second = handoffOf(await submit(user.id, member.id, form));

    expect(second.items.map((i) => i.ausId)).toEqual(
      first.items.map((i) => i.ausId),
    );
  });
});

describe("@phase-2 member Auslage detail", () => {
  async function loadDetail(userId: string, memberId: string, ausId: string) {
    const { load } =
      await import("../../src/routes/portal/auslagen/[ausId]/+page.server.js");
    return load({
      locals: {
        session: {
          user: { id: userId, role: "member_self_service", memberId },
        },
      },
      params: { ausId },
    } as never);
  }

  it("shows the member their own Auslage, with the payout IBAN MASKED", async () => {
    const { member, user } = await seedMemberWithUser(STORED_IBAN);
    const res = await submit(user.id, member.id, buildForm([{}]));
    const ausId = handoffOf(res).items[0]!.ausId;

    const detail = (await loadDetail(user.id, member.id, ausId)) as unknown as {
      node: { ausId: string; maskedIban: string | null };
    };

    expect(detail.node.ausId).toBe(ausId);
    expect(detail.node.maskedIban).toBe("DE89 •••• 3000");
    expect(JSON.stringify(detail)).not.toContain(STORED_IBAN);
  });

  it("404s another member's Auslage — never 403 (no probing which exist)", async () => {
    const owner = await seedMemberWithUser(STORED_IBAN);
    const stranger = await seedMemberWithUser(STORED_IBAN);
    const res = await submit(owner.user.id, owner.member.id, buildForm([{}]));
    const ausId = handoffOf(res).items[0]!.ausId;

    await expect(
      loadDetail(stranger.user.id, stranger.member.id, ausId),
    ).rejects.toMatchObject({ status: 404 });
  });
});
