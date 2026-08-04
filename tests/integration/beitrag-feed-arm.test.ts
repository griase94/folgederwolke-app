// @vitest-environment node
/**
 * S3 — the Mitgliedsbeitrags arm of the unified /app/transaktionen feed.
 *
 * The finding this closes: the Dashboard-KPI counted paid Beiträge, but no
 * money LIST showed them, so a Kassenwart could not reconcile a bank statement
 * against the app and the click from the KPI into the list contradicted itself.
 *
 * Beyond "the rows appear", two things are pinned here because they are the
 * ways this arm can go quietly wrong: the honesty rule (a filter that cannot
 * describe a Beitrag must remove the arm AND zero its chip, never silently
 * return nothing), and the reconciliation identity with the EÜR.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  listTransaktionenFeedPage,
  countTransaktionenFeedByKind,
} from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";
import { loadEurWorkspaceData } from "$lib/server/eur/load.js";
import { markBeitragPaid } from "$lib/server/domain/members-actions.js";
import { seedMember } from "../helpers/db-seed.js";

const YEAR = 2026;
const PAID_ON = `${YEAR}-04-18`;

const state = (params: Record<string, string> = {}) =>
  parseFilterState("transaktionen", new URLSearchParams(params));

const feed = (params: Record<string, string> = {}) =>
  listTransaktionenFeedPage({
    state: state(params),
    year: YEAR,
    limit: 200,
    offset: 0,
    sort: "datum",
  });

describe("S3 — Beiträge in the unified transactions feed", () => {
  beforeAll(async () => {
    // Build the ground truth rather than assuming the seed's shape: one member
    // who PAID in April (so the month filter and the row assertions have
    // something deterministic to bite on) and one who still OWES (so "unpaid
    // Beiträge stay out of the feed" is a real exclusion, not a vacuous pass).
    const payer = await seedMember({ name: "FeedArmZahler" });
    const debtor = await seedMember({ name: "FeedArmSchuldner" });
    const db = getDb();
    for (const m of [payer, debtor]) {
      await db.execute(sql`
        INSERT INTO member_beitrags (member_id, year, betrag_cents, paid_cents)
        VALUES (${m.id}::uuid, ${YEAR}, 6969, 0)
        ON CONFLICT (member_id, year) DO NOTHING
      `);
    }
    const paid = await markBeitragPaid({
      memberId: payer.id,
      year: YEAR,
      gezahltAm: PAID_ON,
      actorUserId: null,
      actorRole: "admin",
    });
    expect(paid.ok).toBe(true);
  });

  it("shows paid Beiträge as rows carrying the Mitglied and a readable BelegNr", async () => {
    const { rows } = await feed();
    const beitraege = rows.filter((r) => r.kind === "beitrag");
    expect(beitraege.length).toBeGreaterThan(0);
    for (const r of beitraege) {
      expect(r.businessId).toMatch(/^MB-\d{4}-[0-9a-f]{8}$/);
      // "Mitgliedsbeitrag <jahr> · <Vorname Nachname>" — the member is what makes
      // the row reconcilable against a bank statement line.
      expect(r.bezeichnung).toMatch(/^Mitgliedsbeitrag \d{4} · \S/);
      expect(r.memberId).toBeTruthy();
      expect(r.sphereEffective).toBe("ideeller");
      expect(r.betragCents).toBeGreaterThan(0);
      // No Beleg concept, so it must never raise the "Beleg fehlt" warning.
      expect(r.belegFehlt).toBe(false);
      expect(r.kategorieId).toBeNull();
    }
  });

  it("counts Beiträge on their own filter chip", async () => {
    const counts = await countTransaktionenFeedByKind({
      state: state(),
      year: YEAR,
    });
    expect(counts.beitrag).toBeGreaterThan(0);
    expect(counts.total).toBe(
      counts.expense + counts.income + counts.donation + counts.beitrag,
    );
  });

  it("?typ=beitraege narrows the feed to Beiträge only", async () => {
    const { rows, total } = await feed({ typ: "beitraege" });
    expect(total).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === "beitrag")).toBe(true);
  });

  it("the feed sum equals the EÜR-Überschuss (no double count, nothing missing)", async () => {
    const { rows } = await feed();
    const footSum = rows.reduce(
      (a, r) => a + (r.kind === "expense" ? -r.betragCents : r.betragCents),
      0,
    );
    const ws = await loadEurWorkspaceData(YEAR);
    expect(footSum).toBe(ws.eur.totalUeberschussCents);
    // …and the Beitrags-part of that is genuinely non-zero, so the identity
    // above is not holding merely because there is nothing to count.
    expect(ws.beitragEinnahmenCents).toBeGreaterThan(0);
  });

  describe("honesty rule", () => {
    it("a Kategorie filter removes the arm AND zeroes its chip", async () => {
      const params = { kategorie: "Sonstige Einnahme (Ideell)" };
      const { rows } = await feed(params);
      expect(rows.some((r) => r.kind === "beitrag")).toBe(false);
      const counts = await countTransaktionenFeedByKind({
        state: state(params),
        year: YEAR,
      });
      // The chip agrees with the empty result a user would get by clicking it.
      expect(counts.beitrag).toBe(0);
    });

    it("„Beleg fehlt“ removes the arm", async () => {
      const { rows } = await feed({ belegFehlt: "true" });
      expect(rows.some((r) => r.kind === "beitrag")).toBe(false);
      const counts = await countTransaktionenFeedByKind({
        state: state({ belegFehlt: "true" }),
        year: YEAR,
      });
      expect(counts.beitrag).toBe(0);
    });

    it("Sphäre CAN describe a Beitrag, so it filters rather than excludes", async () => {
      // ideeller selected → Beiträge stay.
      const withIdeeller = await feed({ sphaere: "ideeller" });
      expect(withIdeeller.rows.some((r) => r.kind === "beitrag")).toBe(true);
      // A sphere Beiträge can never be in → an honest zero, not an exclusion.
      const withoutIdeeller = await feed({ sphaere: "wirtschaftlich" });
      expect(withoutIdeeller.rows.some((r) => r.kind === "beitrag")).toBe(
        false,
      );
    });
  });

  it("filters by the payment month, not the Beitragsjahr", async () => {
    const { rows } = await feed({ typ: "beitraege", monat: "4" });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.relevanzDatum.slice(5, 7)).toBe("04");
  });

  it("finds a Beitrag by the member's name", async () => {
    const { rows } = await feed({ typ: "beitraege" });
    const first = rows[0]!;
    const name = first.bezeichnung.split(" · ")[1]!;
    const hit = await feed({ typ: "beitraege", q: name.split(" ")[0]! });
    expect(hit.rows.length).toBeGreaterThan(0);
    expect(hit.rows.every((r) => r.kind === "beitrag")).toBe(true);
  });

  it("excludes unpaid Beiträge — a debt is not a transaction", async () => {
    const db = getDb();
    const openRows = (await db.execute(sql`
      SELECT count(*)::int AS n FROM member_beitrags
       WHERE year = ${YEAR} AND (gezahlt_am IS NULL OR paid_cents = 0)
    `)) as unknown as Array<{ n: number }>;
    // the fixture really does have open Beiträge
    expect(openRows[0]!.n).toBeGreaterThan(0);

    const { rows } = await feed({ typ: "beitraege" });
    const paidRows = (await db.execute(sql`
      SELECT count(*)::int AS n FROM member_beitrags
       WHERE EXTRACT(YEAR FROM gezahlt_am)::int = ${YEAR}
         AND gezahlt_am IS NOT NULL AND paid_cents > 0
    `)) as unknown as Array<{ n: number }>;
    expect(rows.length).toBe(paidRows[0]!.n);
  });
});
