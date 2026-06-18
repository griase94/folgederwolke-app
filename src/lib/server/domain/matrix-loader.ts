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
import { resolveBeitragState } from "$lib/domain/beitrag-state.js";
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

// daysBetween is used below only for the daysOverdue annotation on overdue
// cells (resolveBeitragState returns the state; we compute the numeric gap
// separately so it can be surfaced in the UI)..

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
  // Uses the canonical resolveBeitragState resolver (single source of truth).
  // The loader never emits a dead "locked_year" state; instead it passes
  // isLocked=true on the cell and the UI renders a lock decoration on top of
  // the honest underlying state (paid/partial/open/…).
  const cells: MatrixCell[] = [];

  for (const m of memberRows) {
    const eintrittsJahr = m.eintrittsDatum
      ? parseInt(m.eintrittsDatum.slice(0, 4), 10)
      : 0;
    const austrittsJahr = m.austrittsDatum
      ? parseInt(m.austrittsDatum.slice(0, 4), 10)
      : null;

    for (const y of opts.years) {
      const dbRow = beitragByMemberYear.get(`${m.id}:${y}`);
      const satz = satzByYear.get(y);

      // Shape the DB row into the BeitragRow the resolver expects.
      const beitragRow = dbRow
        ? {
            betragCents: Number(dbRow.betragCents),
            paidCents: Number(dbRow.paidCents),
            isExempt: dbRow.isExempt ?? false,
            gezahltAm: dbRow.gezahltAm ?? null,
          }
        : null;

      const resolved = resolveBeitragState({
        year: y,
        eintrittsJahr,
        austrittsJahr,
        beitragExempt: m.beitragExempt,
        row: beitragRow,
        satzCents: satz ? Number(satz.cents) : null,
        festBis,
        faelligkeit: satz?.faelligkeitAt ?? undefined,
        graceDays,
      });

      // Compute daysOverdue for the UI annotation (only when state=overdue).
      let daysOverdue: number | null = null;
      if (resolved.state === "overdue") {
        const faelligkeitStr = satz?.faelligkeitAt ?? `${y}-03-31`;
        const faelligkeitDate = new Date(`${faelligkeitStr}T00:00:00Z`);
        daysOverdue = daysBetween(faelligkeitDate, todayDate);
      }

      cells.push({
        memberId: m.id,
        year: y,
        state: resolved.state,
        isLocked: resolved.isLocked,
        betragCents: resolved.betragCents,
        paidCents: resolved.paidCents,
        gezahltAm: dbRow?.gezahltAm ?? null,
        exemptReason: m.beitragExempt
          ? (m.beitragExemptReason ?? null)
          : (dbRow?.exemptReason ?? null),
        daysOverdue,
      });
    }
  }

  // ── Year-header totals ─────────────────────────────────────────────────────
  // Spec §7.3: exempt members excluded from denominator; shown separately as +N befreit.
  // Since resolveBeitragState now produces the honest underlying state (never
  // "locked_year"), paidCount simply counts state==="paid" cells — a locked-but-paid
  // year correctly shows "1/1 bezahlt" because the cell carries state="paid" + isLocked=true.
  // partial cells are included in totalDueCount (they are still due) but not in paidCount.
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
    const paidCells = applicableCells.filter((c) => c.state === "paid");

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
