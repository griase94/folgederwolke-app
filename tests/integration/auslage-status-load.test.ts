/**
 * /auslage-status/[ausId] load — group branch + per-node status (Aurora A-flow
 * S1). Covers group resolution (any AUS-Nr opens all siblings), per-node
 * deriveStatus (each node its own fate — no aggregate), the reject reason
 * exposure, the PII guarantee (masked IBAN only, never full IBAN / e-mail), and
 * the 404 for unknown/malformed numbers.
 *
 * @vitest-environment node
 * @phase-2
 */
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { load } from "../../src/routes/(public)/auslage-status/[ausId]/+page.server.js";

type Node = {
  ausId: string;
  status: string;
  rejectReason: string | null;
  maskedIban: string | null;
};
type LoadFn = (args: {
  params: { ausId: string };
  getClientAddress: () => string;
}) => Promise<{ focusAusId: string; nodes: Node[]; gesamtCents: number }>;
const runLoad = load as unknown as LoadFn;

function ev(ausId: string, ip = "203.0.113.90") {
  return { params: { ausId }, getClientAddress: () => ip };
}

async function seed(over: {
  businessId: string;
  groupId?: string | null;
  betragCents?: number;
  reviewedAt?: Date | null;
  decidedAt?: Date | null;
  decision?: string | null;
  decisionReason?: string | null;
}) {
  await getDb()
    .insert(auslagenSubmissions)
    .values({
      businessId: over.businessId,
      submissionGroupId: over.groupId ?? null,
      bezeichnung: "Getränke",
      betragCents: BigInt(over.betragCents ?? 2490),
      currency: "EUR",
      rechnungsdatum: "2026-07-04",
      bezahltVonKind: "extern",
      externName: "Anna Müller",
      externIban: "DE89370400440532013000",
      externEmail: "anna@example.org",
      bezahltVonDisplay: "Extern: Anna Müller (DE89...3000)",
      belegVerzichtGrund: "fixture",
      consentTextVersion: "test-1",
      reviewedAt: over.reviewedAt ?? null,
      decidedAt: over.decidedAt ?? null,
      decision: over.decision ?? null,
      decisionReason: over.decisionReason ?? null,
    });
}

describe("auslage-status load", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.execute(sql`DELETE FROM auslagen_submissions`);
    await db.execute(sql`DELETE FROM rate_limit_attempts`);
  });

  it("single: derives eingegangen and masks the IBAN, never leaks e-mail", async () => {
    await seed({ businessId: "AUS-2026-401" });
    const data = await runLoad(ev("AUS-2026-401"));
    expect(data.nodes.length).toBe(1);
    expect(data.nodes[0]!.status).toBe("eingegangen");
    // masked: last 4 kept, rest starred; never the full IBAN.
    expect(data.nodes[0]!.maskedIban).toMatch(/^\*+3000$/);
    const json = JSON.stringify(data);
    expect(json).not.toContain("anna@example.org");
    expect(json).not.toContain("DE89370400440532013000");
  });

  it("group: any AUS-Nr opens all siblings; each node keeps its OWN status", async () => {
    const g = crypto.randomUUID();
    await seed({
      businessId: "AUS-2026-501",
      groupId: g,
      reviewedAt: new Date(),
    }); // in_pruefung
    await seed({
      businessId: "AUS-2026-502",
      groupId: g,
      decidedAt: new Date(),
      decision: "rejected",
      decisionReason: "Beleg unscharf.",
    }); // abgelehnt
    await seed({
      businessId: "AUS-2026-503",
      groupId: g,
      decidedAt: new Date(),
      decision: "approved",
    }); // geprueft (no linked expense yet)

    // Reach via the middle number — still all three, focus = the requested one.
    const data = await runLoad(ev("AUS-2026-502"));
    expect(data.nodes.length).toBe(3);
    expect(data.focusAusId).toBe("AUS-2026-502");
    const byId = Object.fromEntries(data.nodes.map((n) => [n.ausId, n]));
    expect(byId["AUS-2026-501"]!.status).toBe("in_pruefung");
    expect(byId["AUS-2026-502"]!.status).toBe("abgelehnt");
    expect(byId["AUS-2026-502"]!.rejectReason).toBe("Beleg unscharf.");
    expect(byId["AUS-2026-503"]!.status).toBe("geprueft");
    // reject reason is exposed ONLY on the abgelehnt node.
    expect(byId["AUS-2026-501"]!.rejectReason).toBeNull();
  });

  it("404: unknown or malformed number rejects (→ +error.svelte search)", async () => {
    await expect(runLoad(ev("AUS-2026-999"))).rejects.toMatchObject({
      status: 404,
    });
    await expect(runLoad(ev("not-an-id"))).rejects.toMatchObject({
      status: 404,
    });
  });
});
