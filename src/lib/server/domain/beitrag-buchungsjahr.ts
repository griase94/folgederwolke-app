/**
 * Buchungsjahr of a paid Mitgliedsbeitrag — the Zufluss year (S2).
 *
 * § 11 EStG (Zuflussprinzip): an EÜR books an Einnahme in the year the money
 * actually arrived. Every other money table in this app already works that way
 * — `income` and `donations` derive `year_of_buchung` from their cash date
 * (migration 0034). `member_beitrags` was the one carve-out: it booked by
 * `year`, the Beitragsjahr the Beitrag is owed FOR. Two things followed from
 * that, both verified against a real DB before this module existed:
 *
 *   1. A 2025 Beitrag paid on 2026-03-20 landed in the EÜR **2025** while
 *      carrying a 2026 Datum, and the Mark-Paid-Popover promised „EÜR 2026".
 *   2. If 2025 was festgeschrieben, a member paying their 2025 Beitrag in 2026
 *      could not be recorded AT ALL (409) — real money with nowhere to go.
 *
 * Since S2 the two concepts are separate and BOTH are load-bearing:
 *
 *   - `member_beitrags.year` = **Beitragsjahr**, the Soll-Zuordnung. Owns the
 *     Mitglieder-Matrix, Mahnwesen/Erinnerungen, Befreiungen, the per-year
 *     Beitragssatz and the Kassenbericht. Unchanged by S2.
 *   - **Buchungsjahr** (this module) owns every money surface: EÜR workspace +
 *     PDF, Jahresabschluss-Hub, Dashboard-Cashflow, GoBD-Z3 journal, and the
 *     Festschreibungs-Gates.
 *
 * Reach for this module whenever a query answers "how much money came in during
 * year X". Use `member_beitrags.year` when it answers "who owes what for year X".
 *
 * `gezahlt_am` is a SQL `date`, so the year needs no timezone conversion —
 * mirroring `extract(year FROM geld_eingang_datum)` on income. (A `date AT TIME
 * ZONE 'Europe/Berlin'` shifts forward by 1–2h from a UTC session and therefore
 * never changes the calendar year, but it is misleading and is not used here.)
 */

import { sql } from "drizzle-orm";
import { memberBeitrags } from "$lib/server/db/schema/members.js";

/**
 * The Buchungsjahr expression for `member_beitrags`, for use in Drizzle query
 * builders and in raw `sql` blocks that select `FROM member_beitrags` WITHOUT
 * a table alias (it renders as `"member_beitrags"."gezahlt_am"`).
 *
 * Where a raw query aliases the table, write the expression out against that
 * alias and point back here in a comment — see the bundle.zip route.
 *
 * Only meaningful for rows that HAVE a payment date; every call site pairs it
 * with `gezahlt_am IS NOT NULL AND paid_cents > 0`, the same "realized cashflow"
 * predicate the EÜR union uses.
 */
export const beitragBuchungsjahr = sql<number>`EXTRACT(YEAR FROM ${memberBeitrags.gezahltAm})::int`;

/**
 * Buchungsjahr of a payment date supplied by an action (`YYYY-MM-DD`), for the
 * Festschreibungs- and Zukunfts-Gates that run before anything is written.
 *
 * Returns `null` for an unparseable date so callers fail closed on their own
 * validation path rather than silently booking into year `NaN`.
 */
export function buchungsjahrOfGezahltAm(
  gezahltAm: string | null | undefined,
): number | null {
  if (!gezahltAm) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gezahltAm.trim());
  if (!m) return null;
  const year = Number(m[1]);
  return Number.isFinite(year) ? year : null;
}
