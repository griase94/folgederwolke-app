/**
 * @phase-9
 *
 * D-Flow §4.1 — the Jahresabschluss-Hub aggregate. The Zahlen-Kreuzprobe (§1):
 * a card's per-Art counts equal the direct DB counts for that year, and the
 * einnahmen/ausgaben/spenden sum equals the total Buchungszahl minus paid
 * Mitgliedsbeiträge — proving the hub and the EÜR/GoBD counts can't disagree.
 */
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { loadJahresabschlussHub } from "$lib/server/eur/hub.js";

async function directCounts(year: number) {
  const db = getDb();
  const r = (await db.execute(sql`
    SELECT
      (SELECT count(*) FROM income   WHERE year_of_buchung = ${year})::int AS einnahmen,
      (SELECT count(*) FROM expenses WHERE year_of_buchung = ${year})::int AS ausgaben,
      (SELECT count(*) FROM donations WHERE year_of_buchung = ${year} AND supersedes_id IS NULL)::int AS spenden,
      (SELECT count(*) FROM member_beitrags WHERE year = ${year} AND gezahlt_am IS NOT NULL AND paid_cents > 0)::int AS beitrags
  `)) as unknown as Array<{
    einnahmen: number;
    ausgaben: number;
    spenden: number;
    beitrags: number;
  }>;
  return r[0]!;
}

describe("loadJahresabschlussHub", () => {
  it("card counts match the direct DB counts for every year (Kreuzprobe)", async () => {
    const hub = await loadJahresabschlussHub();
    expect(hub.years.length).toBeGreaterThan(0);

    for (const card of hub.years) {
      const direct = await directCounts(card.year);
      expect(card.counts, `year ${card.year}`).toEqual(direct);
      // Buchungszahl is the honest total across all four sources.
      expect(card.buchungszahl).toBe(
        direct.einnahmen + direct.ausgaben + direct.spenden + direct.beitrags,
      );
      // Überschuss is derived, never stored.
      expect(card.ueberschussCents).toBe(
        card.einnahmenCents - card.ausgabenCents,
      );
    }
  });

  it("exposes a ready year with the workspace pre-flight (single source of the 8 gates)", async () => {
    const hub = await loadJahresabschlussHub();
    if (hub.readyYear === null) return; // seed has no completed open year
    expect(hub.readyPreFlight).not.toBeNull();
    expect(hub.readyPreFlight!.items.length).toBe(8);
    // The ready year is completed (not the current one) and not yet closed.
    const card = hub.years.find((y) => y.year === hub.readyYear)!;
    expect(card.closed).toBe(false);
  });
});
