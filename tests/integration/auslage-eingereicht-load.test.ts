/**
 * /auslage-eingereicht load — batch receipt resolution (Aurora A-flow S1).
 *
 * Covers the confirmation loader: single vs. group resolution, the 404 bug-fix
 * (a missing/unknown ?id= must 404, never render a blind success), and the
 * PII guarantee (the payload carries no IBAN and no e-mail).
 *
 * @vitest-environment node
 * @phase-2
 */
import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { load } from "../../src/routes/(public)/auslage-eingereicht/+page.server.js";

type LoadFn = (args: {
  url: URL;
  getClientAddress: () => string;
}) => Promise<Record<string, unknown>>;
const runLoad = load as unknown as LoadFn;

function ev(id: string | null, ip = "203.0.113.80") {
  const url = new URL("http://test.local/auslage-eingereicht");
  if (id !== null) url.searchParams.set("id", id);
  return { url, getClientAddress: () => ip };
}

async function seedRow(over: {
  businessId: string;
  groupId?: string | null;
  betragCents: number;
  bezeichnung: string;
}) {
  await getDb()
    .insert(auslagenSubmissions)
    .values({
      businessId: over.businessId,
      submissionGroupId: over.groupId ?? null,
      bezeichnung: over.bezeichnung,
      betragCents: BigInt(over.betragCents),
      currency: "EUR",
      bezahltVonKind: "extern",
      externName: "Anna Müller",
      externIban: "DE89370400440532013000",
      externEmail: "anna@example.org",
      bezahltVonDisplay: "Extern: Anna Müller (DE89...3000)",
      belegVerzichtGrund: "fixture",
      consentTextVersion: "test-1",
    });
}

describe("auslage-eingereicht load", () => {
  beforeEach(async () => {
    const db = getDb();
    await db.execute(sql`DELETE FROM auslagen_submissions`);
    await db.execute(sql`DELETE FROM rate_limit_attempts`);
  });

  it("single: resolves one AUS-Nr, first name, absolute date, status URL", async () => {
    await seedRow({
      businessId: "AUS-2026-101",
      betragCents: 2490,
      bezeichnung: "Getränke",
    });
    const data = await runLoad(ev("AUS-2026-101"));
    expect((data.items as unknown[]).length).toBe(1);
    expect(data.vorname).toBe("Anna");
    expect(data.gesamtCents).toBe(2490);
    expect(data.statusUrl).toBe("/auslage-status/AUS-2026-101");
  });

  it("batch: any AUS-Nr resolves the whole group, total = sum, status opens the first", async () => {
    const g = crypto.randomUUID();
    await seedRow({
      businessId: "AUS-2026-201",
      groupId: g,
      betragCents: 2490,
      bezeichnung: "Kuchen",
    });
    await seedRow({
      businessId: "AUS-2026-202",
      groupId: g,
      betragCents: 1490,
      bezeichnung: "Miete",
    });
    await seedRow({
      businessId: "AUS-2026-203",
      groupId: g,
      betragCents: 2390,
      bezeichnung: "Deko",
    });

    // Reach the group via the MIDDLE number — still opens all three.
    const data = await runLoad(ev("AUS-2026-202"));
    expect((data.items as unknown[]).length).toBe(3);
    expect(data.gesamtCents).toBe(6370);
    // Status CTA opens the first (lowest) AUS-Nr of the group.
    expect(data.statusUrl).toBe("/auslage-status/AUS-2026-201");
  });

  it("PII: the payload carries no IBAN and no e-mail", async () => {
    await seedRow({
      businessId: "AUS-2026-301",
      betragCents: 500,
      bezeichnung: "Porto",
    });
    const data = await runLoad(ev("AUS-2026-301"));
    const json = JSON.stringify(data);
    expect(json).not.toContain("DE89370400440532013000");
    expect(json).not.toContain("anna@example.org");
  });

  it("404: unknown or malformed/missing id → error, never a blind success", async () => {
    await expect(runLoad(ev("AUS-2026-999"))).rejects.toMatchObject({
      status: 404,
    });
    await expect(runLoad(ev("not-an-id"))).rejects.toMatchObject({
      status: 404,
    });
    await expect(runLoad(ev(null))).rejects.toMatchObject({ status: 404 });
  });
});
