/**
 * Aurora A-flow S0 — batch submission core (submitAuslagenBatch) + batch ID
 * allocator (allocateBusinessIds).
 *
 * Covers the flow-brief §4 risk-1 retry matrix (full / partial / — the
 * concurrent 23505 backstop is covered by auslagen-idempotency.test.ts against
 * the same partial UNIQUE index), the risk-3 single-digest guarantee (exactly
 * ONE EingangsMail per batch, deduped on the group), the M4 erstattung_iban
 * snapshot, and the Fall-B/C in-tx members.iban write.
 *
 * RESET lane, fileParallelism=false. Real DB (app_runtime). Mail provider is
 * no-op → sendMail still writes the sent_mails row we assert on (ADR-0005).
 *
 * @phase-2
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { sql, eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { registerHandlers } from "$lib/server/events/index.js";
import {
  submitAuslagenBatch,
  MAX_BATCH_ITEMS,
  type AuslageBatchItem,
} from "$lib/server/domain/auslage-submit.js";
import { allocateBusinessIds } from "$lib/server/domain/id-allocator.js";
import { members } from "$lib/server/db/schema/members.js";
import { DATENSCHUTZ_VERSION } from "$lib/server/domain/datenschutz.js";

registerHandlers();

const IBAN_A = "DE89370400440532013000";
const IBAN_B = "DE02120300000000202051";

function item(over: Partial<AuslageBatchItem> = {}): AuslageBatchItem {
  return {
    submissionNonce: crypto.randomUUID(),
    bezeichnung: "Bahnticket",
    rechnungsdatum: "2026-03-01",
    betragCents: 1250,
    belegVerzichtGrund: "Kein Beleg — Integrationstest (Verzicht-Arm).",
    ...over,
  };
}

async function memberIdByEmail(email: string): Promise<string> {
  const rows = (await getDb().execute(
    sql`SELECT id::text AS id FROM members WHERE email = ${email} LIMIT 1`,
  )) as unknown as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error(`no member fixture for ${email}`);
  return id;
}

async function eingangMailCount(): Promise<number> {
  const rows = (await getDb().execute(
    sql`SELECT count(*)::int AS c FROM sent_mails WHERE template = 'auslage_eingang'`,
  )) as unknown as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

async function createAnchorCount(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = (await getDb().execute(sql`
    SELECT count(*)::int AS c FROM audit_log
     WHERE entity_kind = 'auslagen_submission'
       AND action = 'create'
       AND entity_id = ANY(${sql.raw(`ARRAY[${ids.map((i) => `'${i}'`).join(",")}]::uuid[]`)})
  `)) as unknown as Array<{ c: number }>;
  return rows[0]?.c ?? 0;
}

describe("allocateBusinessIds", () => {
  beforeEach(async () => {
    await getDb().execute(sql`DELETE FROM id_counters WHERE kind = 'AUS'`);
  });

  it("returns count consecutive gapless ids and continues across calls", async () => {
    const first = await allocateBusinessIds("AUS", 3, 2026);
    expect(first).toEqual(["AUS-2026-001", "AUS-2026-002", "AUS-2026-003"]);
    const next = await allocateBusinessIds("AUS", 2, 2026);
    expect(next).toEqual(["AUS-2026-004", "AUS-2026-005"]);
  });

  it("count<=0 returns [] and does not bump the counter", async () => {
    expect(await allocateBusinessIds("AUS", 0, 2026)).toEqual([]);
    const after = await allocateBusinessIds("AUS", 1, 2026);
    expect(after).toEqual(["AUS-2026-001"]);
  });
});

describe("submitAuslagenBatch", () => {
  beforeAll(() => {
    registerHandlers();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.execute(sql`DELETE FROM auslagen_submissions`);
    await db.execute(sql`DELETE FROM id_counters WHERE kind = 'AUS'`);
    await db.execute(sql`DELETE FROM sent_mails`);
    await db.execute(sql`DELETE FROM rate_limit_attempts`);
    // Ensure the member IBAN-write fixture starts from a known NULL iban.
    await db
      .update(members)
      .set({ iban: null })
      .where(eq(members.email, "anna.mueller@example.de"));
  });

  it("3 extern items → ONE group, 3 rows, 3 create-anchors, exactly ONE digest mail", async () => {
    const res = await submitAuslagenBatch({
      bezahltVon: {
        kind: "extern",
        name: "Jane Doe",
        iban: IBAN_A,
        email: "jane@example.org",
      },
      items: [item(), item(), item()],
      consentTextVersion: DATENSCHUTZ_VERSION,
      notifyEmail: "jane@example.org",
      notifyVorname: "Jane",
    });

    expect(res.deduped).toBe(false);
    expect(res.submissions).toHaveLength(3);
    const ausIds = res.submissions.map((s) => s.businessId);
    expect(new Set(ausIds).size).toBe(3); // distinct
    ausIds.forEach((b) => expect(b).toMatch(/^AUS-\d{4}-\d{3}$/));

    // All rows share the ONE group id; extern arm writes extern_iban, NOT
    // erstattung_iban.
    const rows = (await getDb().execute(sql`
      SELECT submission_group_id::text AS g, extern_iban, erstattung_iban
        FROM auslagen_submissions
    `)) as unknown as Array<{
      g: string;
      extern_iban: string | null;
      erstattung_iban: string | null;
    }>;
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.g)).size).toBe(1);
    expect(rows[0]!.g).toBe(res.submissionGroupId);
    rows.forEach((r) => {
      expect(r.extern_iban).toBe(IBAN_A);
      expect(r.erstattung_iban).toBeNull();
    });

    // One in-tx create-anchor per row.
    expect(await createAnchorCount(res.submissions.map((s) => s.id))).toBe(3);

    // Exactly ONE EingangsMail for the whole batch (deduped on the group).
    expect(await eingangMailCount()).toBe(1);
    const mail = (await getDb().execute(sql`
      SELECT entity_kind, entity_id::text AS eid
        FROM sent_mails WHERE template = 'auslage_eingang'
    `)) as unknown as Array<{ entity_kind: string; eid: string }>;
    expect(mail[0]!.entity_kind).toBe("auslagen_submission");
    expect(mail[0]!.eid).toBe(res.submissionGroupId);
  });

  it("full retry (same nonces) → deduped, no new rows, still ONE digest mail", async () => {
    const items = [item(), item()];
    const first = await submitAuslagenBatch({
      bezahltVon: {
        kind: "extern",
        name: "Jane",
        iban: IBAN_A,
        email: "j@e.org",
      },
      items,
      consentTextVersion: DATENSCHUTZ_VERSION,
      notifyEmail: "j@e.org",
      notifyVorname: "Jane",
    });
    expect(first.deduped).toBe(false);

    // Same nonces → idempotent retry.
    const retry = await submitAuslagenBatch({
      bezahltVon: {
        kind: "extern",
        name: "Jane",
        iban: IBAN_A,
        email: "j@e.org",
      },
      items,
      consentTextVersion: DATENSCHUTZ_VERSION,
      notifyEmail: "j@e.org",
      notifyVorname: "Jane",
    });
    expect(retry.deduped).toBe(true);
    expect(retry.submissionGroupId).toBe(first.submissionGroupId);
    expect(retry.submissions.map((s) => s.businessId).sort()).toEqual(
      first.submissions.map((s) => s.businessId).sort(),
    );

    const count = (await getDb().execute(
      sql`SELECT count(*)::int AS c FROM auslagen_submissions`,
    )) as unknown as Array<{ c: number }>;
    expect(count[0]!.c).toBe(2); // no new rows
    expect(await eingangMailCount()).toBe(1); // dedup on the group
  });

  it("partial retry (2 old + 1 new nonce) → adds the new item INTO the existing group", async () => {
    const a = item();
    const b = item();
    const first = await submitAuslagenBatch({
      bezahltVon: {
        kind: "extern",
        name: "Jane",
        iban: IBAN_A,
        email: "j@e.org",
      },
      items: [a, b],
      consentTextVersion: DATENSCHUTZ_VERSION,
      notifyEmail: "j@e.org",
      notifyVorname: "Jane",
    });

    const c = item();
    const second = await submitAuslagenBatch({
      bezahltVon: {
        kind: "extern",
        name: "Jane",
        iban: IBAN_A,
        email: "j@e.org",
      },
      items: [a, b, c], // a,b carry committed nonces; c is new
      consentTextVersion: DATENSCHUTZ_VERSION,
      notifyEmail: "j@e.org",
      notifyVorname: "Jane",
    });

    expect(second.deduped).toBe(false);
    expect(second.submissionGroupId).toBe(first.submissionGroupId);
    expect(second.submissions).toHaveLength(3);

    const rows = (await getDb().execute(sql`
      SELECT submission_group_id::text AS g FROM auslagen_submissions
    `)) as unknown as Array<{ g: string }>;
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.g))).toEqual(
      new Set([first.submissionGroupId]),
    );
  });

  it("member arm snapshots erstattung_iban on every row; no profile write by default", async () => {
    const memberId = await memberIdByEmail("anna.mueller@example.de");
    const res = await submitAuslagenBatch({
      bezahltVon: {
        kind: "member",
        member_id: memberId,
        display_name: "Anna Müller",
        email: "anna.mueller@example.de",
      },
      erstattungIban: IBAN_B,
      items: [item(), item()],
      consentTextVersion: DATENSCHUTZ_VERSION,
      actorUserId: null,
      notifyEmail: "anna.mueller@example.de",
      notifyVorname: "Anna",
    });
    expect(res.submissions).toHaveLength(2);

    const rows = (await getDb().execute(sql`
      SELECT erstattung_iban, extern_iban, bezahlt_von_kind,
             bezahlt_von_member_id::text AS mid
        FROM auslagen_submissions
    `)) as unknown as Array<{
      erstattung_iban: string | null;
      extern_iban: string | null;
      bezahlt_von_kind: string;
      mid: string | null;
    }>;
    rows.forEach((r) => {
      expect(r.erstattung_iban).toBe(IBAN_B);
      expect(r.extern_iban).toBeNull();
      expect(r.bezahlt_von_kind).toBe("member");
      expect(r.mid).toBe(memberId);
    });

    // No profile write requested → members.iban stays NULL.
    const m = (await getDb().execute(
      sql`SELECT iban FROM members WHERE id = ${memberId}::uuid`,
    )) as unknown as Array<{ iban: string | null }>;
    expect(m[0]!.iban).toBeNull();
  });

  it("memberIbanWrite (Fall B/C) updates members.iban in-tx + writes an audit anchor", async () => {
    const memberId = await memberIdByEmail("anna.mueller@example.de");
    await submitAuslagenBatch({
      bezahltVon: {
        kind: "member",
        member_id: memberId,
        display_name: "Anna Müller",
        email: "anna.mueller@example.de",
      },
      erstattungIban: IBAN_B,
      items: [item()],
      consentTextVersion: DATENSCHUTZ_VERSION,
      memberIbanWrite: { memberId, iban: IBAN_B },
      actorUserId: null,
      notifyEmail: "anna.mueller@example.de",
      notifyVorname: "Anna",
    });

    const m = (await getDb().execute(
      sql`SELECT iban FROM members WHERE id = ${memberId}::uuid`,
    )) as unknown as Array<{ iban: string | null }>;
    expect(m[0]!.iban).toBe(IBAN_B);

    const audit = (await getDb().execute(sql`
      SELECT count(*)::int AS c FROM audit_log
       WHERE entity_kind = 'member' AND action = 'update'
         AND entity_id = ${memberId}::uuid
         AND payload->>'kind' = 'iban_updated'
    `)) as unknown as Array<{ c: number }>;
    expect(audit[0]!.c).toBe(1);
  });

  it("empty items → throws (guard)", async () => {
    await expect(
      submitAuslagenBatch({
        bezahltVon: { kind: "verein" },
        items: [],
        consentTextVersion: DATENSCHUTZ_VERSION,
      }),
    ).rejects.toThrow(/items must not be empty/);
  });

  it("F2: >10 items → throws, nothing inserted (batch cap backstop)", async () => {
    const many = Array.from({ length: MAX_BATCH_ITEMS + 1 }, () => item());
    await expect(
      submitAuslagenBatch({
        bezahltVon: {
          kind: "extern",
          name: "J",
          iban: IBAN_A,
          email: "j@e.org",
        },
        items: many,
        consentTextVersion: DATENSCHUTZ_VERSION,
      }),
    ).rejects.toThrow(/exceeds 10 items/);
    const count = (await getDb().execute(
      sql`SELECT count(*)::int AS c FROM auslagen_submissions`,
    )) as unknown as Array<{ c: number }>;
    expect(count[0]!.c).toBe(0);

    // Exactly MAX_BATCH_ITEMS is allowed.
    const ok = await submitAuslagenBatch({
      bezahltVon: { kind: "extern", name: "J", iban: IBAN_A, email: "j@e.org" },
      items: Array.from({ length: MAX_BATCH_ITEMS }, () => item()),
      consentTextVersion: DATENSCHUTZ_VERSION,
    });
    expect(ok.submissions).toHaveLength(MAX_BATCH_ITEMS);
  });

  it("F1: non-positive or fractional betragCents → throws, nothing inserted", async () => {
    for (const bad of [0, -50, 12.5, Number.NaN]) {
      await expect(
        submitAuslagenBatch({
          bezahltVon: {
            kind: "extern",
            name: "J",
            iban: IBAN_A,
            email: "j@e.org",
          },
          items: [item({ betragCents: bad })],
          consentTextVersion: DATENSCHUTZ_VERSION,
        }),
      ).rejects.toThrow(/positive integer/);
    }
    const count = (await getDb().execute(
      sql`SELECT count(*)::int AS c FROM auslagen_submissions`,
    )) as unknown as Array<{ c: number }>;
    expect(count[0]!.c).toBe(0);
  });
});
