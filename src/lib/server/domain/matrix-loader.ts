/**
 * Matrix loader — per-cell state derivation for the Mitglieder-Beitragsmatrix.
 *
 * Task 2.0: Computes CellState for every (member, year) pair in the requested
 * window, derives exempt-aware year-header totals, handles pre-join / post-Austritt
 * cells, and applies the locked-year overlay from festgeschriebenBis.
 *
 * This is the data contract for all Phase-2 UI components (MatrixCell, popovers,
 * year-header aria-labels). No UI logic lives here.
 *
 * Spec §7.1–§7.3 + Plan Task 2.0.
 */

import { and, inArray, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { berlinYmd } from "$lib/domain/year.js";
import type {
  CellState,
  MatrixCell,
  YearHeader,
  MatrixMember,
  MatrixData,
} from "$lib/domain/beitrag-cell.js";

// Re-export the client-safe types so server callers can import everything from
// one place. The data contract lives in $lib/domain/beitrag-cell.ts.
export type { CellState, MatrixCell, YearHeader, MatrixMember, MatrixData };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Days between two dates (positive = second is after first). */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/** Add N calendar days to a Date, return new Date. */
function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + n);
  return result;
}

async function fetchFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function getGraceDays(): Promise<number> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'beitrag.overdue_grace_days'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return 60;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : 60;
  }
  return 60;
}

// ---------------------------------------------------------------------------
// loadMatrix
// ---------------------------------------------------------------------------

export async function loadMatrix(opts: {
  years: number[];
  /** Only pass active members? Default: all members. */
  activeOnly?: boolean;
}): Promise<MatrixData> {
  const db = getDb();
  const today = berlinYmd();
  const todayDate = new Date(`${today}T00:00:00Z`);
  const [festBis, graceDays] = await Promise.all([
    fetchFestgeschriebenBis(),
    getGraceDays(),
  ]);

  // ── Load members (all, ordered by name) ────────────────────────────────────
  const memberRows = await db
    .select()
    .from(members)
    .orderBy(members.nachname, members.vorname);

  // ── Load all beitrag rows for the requested years ──────────────────────────
  const memberIds = memberRows.map((m) => m.id);
  let beitragRows: (typeof memberBeitrags.$inferSelect)[] = [];
  if (memberIds.length > 0 && opts.years.length > 0) {
    beitragRows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          inArray(memberBeitrags.memberId, memberIds),
          inArray(memberBeitrags.year, opts.years),
        ),
      );
  }

  // ── Load Beitragssätze + Fälligkeiten for the requested years ─────────────
  let satzRows: (typeof beitragssatzByYear.$inferSelect)[] = [];
  if (opts.years.length > 0) {
    satzRows = await db
      .select()
      .from(beitragssatzByYear)
      .where(inArray(beitragssatzByYear.year, opts.years));
  }

  // Build fast-access maps
  const beitragByMemberYear = new Map<string, (typeof beitragRows)[0]>();
  for (const b of beitragRows) {
    beitragByMemberYear.set(`${b.memberId}:${b.year}`, b);
  }

  const satzByYear = new Map<number, (typeof satzRows)[0]>();
  for (const s of satzRows) {
    satzByYear.set(s.year, s);
  }

  // ── Derive per-(member, year) cells ────────────────────────────────────────
  const cells: MatrixCell[] = [];

  for (const m of memberRows) {
    // Parse eintrittsDatum and austrittsDatum
    const eintrittsJahr = m.eintrittsDatum
      ? parseInt(m.eintrittsDatum.slice(0, 4), 10)
      : 0;
    const austrittsJahr = m.austrittsDatum
      ? parseInt(m.austrittsDatum.slice(0, 4), 10)
      : null;

    for (const y of opts.years) {
      const row = beitragByMemberYear.get(`${m.id}:${y}`);
      const satz = satzByYear.get(y);
      const betragCents = row
        ? Number(row.betragCents)
        : satz
          ? Number(satz.cents)
          : 0;

      let state: CellState;
      let daysOverdue: number | null = null;

      // State derivation priority (spec §7.2):
      // 1. Pre-join years
      if (y < eintrittsJahr) {
        state = "not_applicable_pre_join";
      }
      // 2. Post-Austritt years
      else if (austrittsJahr !== null && y > austrittsJahr) {
        state = "not_applicable_post_austritt";
      }
      // 3. Permanent exemption (overrides per-year)
      else if (m.beitragExempt) {
        state = "permanently_exempt";
      }
      // 4. Per-year exemption
      else if (row?.isExempt) {
        state = "exempt";
      }
      // 5. Locked year (festgeschrieben)
      else if (festBis !== null && y <= festBis) {
        state = "locked_year";
      }
      // 6. Paid
      else if (
        row &&
        Number(row.paidCents) >= Number(row.betragCents) &&
        Number(row.betragCents) > 0
      ) {
        state = "paid";
      }
      // 7. Open or overdue
      else {
        const faelligkeitStr = satz?.faelligkeitAt ?? `${y}-03-31`;
        const faelligkeitDate = new Date(`${faelligkeitStr}T00:00:00Z`);
        const overdueThreshold = addDays(faelligkeitDate, graceDays);

        if (todayDate > overdueThreshold) {
          state = "overdue";
          daysOverdue = daysBetween(faelligkeitDate, todayDate);
        } else {
          state = "open";
        }
      }

      cells.push({
        memberId: m.id,
        year: y,
        state,
        betragCents,
        paidCents: row ? Number(row.paidCents) : 0,
        gezahltAm: row?.gezahltAm ?? null,
        exemptReason: m.beitragExempt
          ? (m.beitragExemptReason ?? null)
          : (row?.exemptReason ?? null),
        daysOverdue,
      });
    }
  }

  // ── Year-header totals ─────────────────────────────────────────────────────
  // Spec §7.3: exempt members excluded from denominator; shown separately as +N befreit.
  const headers: YearHeader[] = opts.years.map((y) => {
    const yearCells = cells.filter((c) => c.year === y);

    const exemptCells = yearCells.filter(
      (c) => c.state === "exempt" || c.state === "permanently_exempt",
    );
    const applicableCells = yearCells.filter(
      (c) =>
        c.state !== "not_applicable_pre_join" &&
        c.state !== "not_applicable_post_austritt" &&
        c.state !== "exempt" &&
        c.state !== "permanently_exempt",
    );
    // For locked_year cells, state derivation stops at the lock check (step 5),
    // so state never reaches "paid" even when the underlying beitrag IS paid.
    // Count a locked_year cell as paid when paidCents >= betragCents > 0.
    const paidCells = applicableCells.filter(
      (c) =>
        c.state === "paid" ||
        (c.state === "locked_year" &&
          c.betragCents > 0 &&
          c.paidCents >= c.betragCents),
    );

    return {
      year: y,
      paidCount: paidCells.length,
      totalDueCount: applicableCells.length,
      paidSumCents: paidCells.reduce((s, c) => s + c.paidCents, 0),
      exemptCount: exemptCells.length,
      isLocked: festBis !== null && y <= festBis,
    };
  });

  const matrixMembers: MatrixMember[] = memberRows.map((m) => ({
    id: m.id,
    vorname: m.vorname,
    nachname: m.nachname,
    eintrittsJahr: m.eintrittsDatum
      ? parseInt(m.eintrittsDatum.slice(0, 4), 10)
      : 0,
    austrittsJahr: m.austrittsDatum
      ? parseInt(m.austrittsDatum.slice(0, 4), 10)
      : null,
    beitragExempt: m.beitragExempt,
    beitragExemptReason: m.beitragExemptReason ?? null,
  }));

  return {
    members: matrixMembers,
    years: opts.years,
    cells,
    headers,
    festgeschriebenBis: festBis,
  };
}
