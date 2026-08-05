/**
 * Jahresabschluss-Hub aggregate (D-Flow §4.1).
 *
 * One query builds the per-year card shape for the hub's .ycard stack — the
 * 3-source Einnahmen union (income + donations + paid Mitgliedsbeiträge) +
 * expense Ausgaben, counts per Art, Buchungszahl, and the closed state. The
 * "abschlussbereit" year (most recent completed, not-yet-closed) additionally
 * carries the full pre-flight checklist (reused from loadEurWorkspaceData, the
 * single source of the 8 gates) so the Hub and the [year] workspace can never
 * disagree.
 *
 * Zahlen-Kreuzprobe (§1): a card's counts (einnahmen/ausgaben/spenden) equal
 * the gobd-export counts equal the EÜR — asserted against the seed in
 * jahresabschluss-hub.test.ts.
 */

import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { beitragBuchungsjahr } from "$lib/server/domain/beitrag-buchungsjahr.js";
import { berlinYear } from "$lib/domain/year.js";
import { loadEurWorkspaceData } from "./load.js";
import type { PreFlightChecklist } from "./index.js";

export interface HubYearCard {
  year: number;
  closed: boolean;
  einnahmenCents: number;
  ausgabenCents: number;
  ueberschussCents: number;
  /** Total Buchungen: income + expense + donations + paid Mitgliedsbeiträge. */
  buchungszahl: number;
  counts: {
    einnahmen: number;
    ausgaben: number;
    spenden: number;
    beitrags: number;
  };
}

export interface JahresabschlussHub {
  years: HubYearCard[];
  /** Most recent completed, not-yet-closed year — the abschlussbereite Karte. */
  readyYear: number | null;
  /** Full pre-flight for the ready year (the close gate + checklist). */
  readyPreFlight: PreFlightChecklist | null;
  /** Current Buchungsjahr (Europe/Berlin) — the „läuft"-Karte on the Hub. */
  currentYear: number;
}

interface HubAggRow {
  year: number;
  einnahmen_cents: string | number;
  ausgaben_cents: string | number;
  c_einnahmen: number;
  c_ausgaben: number;
  c_spenden: number;
  c_beitrags: number;
}

async function readFestgeschriebenBis(
  db: ReturnType<typeof getDb>,
): Promise<number | null> {
  const res = (await db.execute(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  )) as { value: unknown }[];
  const v = res[0]?.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function loadJahresabschlussHub(): Promise<JahresabschlussHub> {
  const db = getDb();

  // Per-year sums + counts over the 3-source Einnahmen union + expense
  // Ausgaben. Donations exclude Storno originals (supersedes_id IS NULL);
  // Mitgliedsbeiträge count only realized cashflow (gezahlt_am, paid_cents>0)
  // and land in their Zufluss year, not their Beitragsjahr (S2) — so a card's
  // Einnahmen match the EÜR for the same year.
  const rows = (await db.execute(sql`
    WITH feed AS (
      SELECT year_of_buchung AS year, 'einnahmen'::text AS art, betrag_cents AS cents FROM income
      UNION ALL
      SELECT year_of_buchung, 'spenden', betrag_cents FROM donations WHERE supersedes_id IS NULL
      UNION ALL
      SELECT ${beitragBuchungsjahr}, 'beitrags', paid_cents FROM member_beitrags WHERE gezahlt_am IS NOT NULL AND paid_cents > 0
      UNION ALL
      SELECT year_of_buchung, 'ausgaben', betrag_cents FROM expenses
    )
    SELECT year,
           COALESCE(SUM(cents) FILTER (WHERE art <> 'ausgaben'), 0)::bigint AS einnahmen_cents,
           COALESCE(SUM(cents) FILTER (WHERE art = 'ausgaben'), 0)::bigint AS ausgaben_cents,
           COUNT(*) FILTER (WHERE art = 'einnahmen')::int AS c_einnahmen,
           COUNT(*) FILTER (WHERE art = 'ausgaben')::int AS c_ausgaben,
           COUNT(*) FILTER (WHERE art = 'spenden')::int AS c_spenden,
           COUNT(*) FILTER (WHERE art = 'beitrags')::int AS c_beitrags
      FROM feed
     GROUP BY year
     ORDER BY year DESC
  `)) as unknown as HubAggRow[];

  const festgeschriebenBis = await readFestgeschriebenBis(db);
  const currentYear = berlinYear();

  const years: HubYearCard[] = rows.map((r) => {
    const einnahmenCents = Number(r.einnahmen_cents);
    const ausgabenCents = Number(r.ausgaben_cents);
    const closed = festgeschriebenBis !== null && r.year <= festgeschriebenBis;
    return {
      year: r.year,
      closed,
      einnahmenCents,
      ausgabenCents,
      ueberschussCents: einnahmenCents - ausgabenCents,
      buchungszahl: r.c_einnahmen + r.c_ausgaben + r.c_spenden + r.c_beitrags,
      counts: {
        einnahmen: r.c_einnahmen,
        ausgaben: r.c_ausgaben,
        spenden: r.c_spenden,
        beitrags: r.c_beitrags,
      },
    };
  });

  // Always surface the current year as a card even with no bookings yet.
  if (!years.some((y) => y.year === currentYear)) {
    years.unshift({
      year: currentYear,
      closed: false,
      einnahmenCents: 0,
      ausgabenCents: 0,
      ueberschussCents: 0,
      buchungszahl: 0,
      counts: { einnahmen: 0, ausgaben: 0, spenden: 0, beitrags: 0 },
    });
    years.sort((a, b) => b.year - a.year);
  }

  // The abschlussbereite Karte: the most recent year that has fully ended
  // (< current Buchungsjahr) and is not yet festgeschrieben.
  const readyYear =
    years.find((y) => y.year < currentYear && !y.closed)?.year ?? null;

  // The ready year's pre-flight comes from the SAME composer the [year]
  // workspace uses — the 8 gates can never disagree between Hub and workspace.
  const readyPreFlight =
    readyYear !== null
      ? (await loadEurWorkspaceData(readyYear)).preFlight
      : null;

  return { years, readyYear, readyPreFlight, currentYear };
}
