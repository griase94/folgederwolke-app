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

// Exported so the member detail page can resolve its cells from the SAME
// festBis/graceDays settings the matrix uses (S4 #1 — single source, no more
// client-side festBis:null derivation).
export { fetchFestgeschriebenBis, getGraceDays };

/** Member fields resolveMemberCells needs (a subset of the members row). */
export type MemberCellInput = {
  id: string;
  eintrittsDatum: string | null;
  austrittsDatum: string | null;
  beitragExempt: boolean;
  beitragExemptReason: string | null;
};
type BeitragCellRow = {
  betragCents: number | bigint;
  paidCents: number | bigint;
  isExempt: boolean | null;
  gezahltAm: string | null;
  notes: string | null;
  exemptReason: string | null;
};
type SatzCellRow = { cents: number | bigint; faelligkeitAt: string | null };

/**
 * Resolve every (member, year) cell for ONE member — the SINGLE source of
 * per-cell state shared by the Beitragsmatrix (all members, `loadMatrix`) and
 * the member detail page (one member, `loadMemberCells`). Uses the canonical
 * `resolveBeitragState` + the Zoe daysOverdue clamp (`max(Fälligkeit, Eintritt)`)
 * so a mid-year joiner never shows inflated overdue days. The caller passes the
 * REAL `festBis` — never null — so the detail pill correctly reflects
 * Festschreibung (fixes the pre-existing client-side festBis:null bug).
 */
export function resolveMemberCells(
  member: MemberCellInput,
  years: number[],
  getBeitrag: (year: number) => BeitragCellRow | undefined,
  getSatz: (year: number) => SatzCellRow | undefined,
  festBis: number | null,
  graceDays: number,
  todayDate: Date,
): MatrixCell[] {
  const eintrittsJahr = member.eintrittsDatum
    ? parseInt(member.eintrittsDatum.slice(0, 4), 10)
    : 0;
  const austrittsJahr = member.austrittsDatum
    ? parseInt(member.austrittsDatum.slice(0, 4), 10)
    : null;

  const out: MatrixCell[] = [];
  for (const y of years) {
    const dbRow = getBeitrag(y);
    const satz = getSatz(y);

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
      beitragExempt: member.beitragExempt,
      row: beitragRow,
      satzCents: satz ? Number(satz.cents) : null,
      festBis,
      faelligkeit: satz?.faelligkeitAt ?? undefined,
      graceDays,
    });

    let daysOverdue: number | null = null;
    if (resolved.state === "overdue") {
      const faelligkeitStr = satz?.faelligkeitAt ?? `${y}-03-31`;
      const faelligkeitDate = new Date(`${faelligkeitStr}T00:00:00Z`);
      const eintrittDate = member.eintrittsDatum
        ? new Date(`${member.eintrittsDatum}T00:00:00Z`)
        : null;
      const clockStart =
        eintrittDate && eintrittDate.getTime() > faelligkeitDate.getTime()
          ? eintrittDate
          : faelligkeitDate;
      daysOverdue = daysBetween(clockStart, todayDate);
    }

    out.push({
      memberId: member.id,
      year: y,
      state: resolved.state,
      isLocked: resolved.isLocked,
      betragCents: resolved.betragCents,
      paidCents: resolved.paidCents,
      gezahltAm: dbRow?.gezahltAm ?? null,
      notes: dbRow?.notes ?? null,
      exemptReason: member.beitragExempt
        ? (member.beitragExemptReason ?? null)
        : (dbRow?.exemptReason ?? null),
      daysOverdue,
    });
  }
  return out;
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
    cells.push(
      ...resolveMemberCells(
        m,
        opts.years,
        (y) => beitragByMemberYear.get(`${m.id}:${y}`),
        (y) => satzByYear.get(y),
        festBis,
        graceDays,
        todayDate,
      ),
    );
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
      // §4.5: no Satz row for the year → header shows a "Beitragssatz fehlt" hint
      // rather than implying a Soll of 0.
      satzMissing: !satzByYear.has(y),
    };
  });

  const matrixMembers: MatrixMember[] = memberRows.map((m) => ({
    id: m.id,
    vorname: m.vorname,
    nachname: m.nachname,
    email: m.email ?? null,
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
