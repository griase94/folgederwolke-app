/**
 * Dashboard domain helpers — real Drizzle queries for the treasurer's
 * "Was möchtest du heute tun?" interface (Phase 6).
 *
 * All queries are read-only. Money values are integer cents (ADR-0003).
 * Year is derived via Europe/Berlin timezone consistent with ADR-0001.
 */

import {
  and,
  count,
  desc,
  eq,
  isNull,
  isNotNull,
  lt,
  sql,
  sum,
} from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WgbStatus {
  einnahmenCents: number;
  freigrenzeCents: number;
  status: "ok" | "erhoeht" | "kritisch" | "ueberschritten";
  year: number;
}

/**
 * Cashflow overview block (C3, 2026-05-20). Drives the 2 large Einnahmen/
 * Ausgaben cards (with sparkline + LY-delta) and the 4 link chips on the
 * dashboard.
 *
 * All values are integer cents (ADR-0003). Monthly arrays are length 12,
 * 0-indexed (Jan…Dec) for the selected `year`. LY = last year, same period
 * (Jan→today's month, capped at 12) — direct year-over-year for past years.
 */
export interface CashflowOverview {
  year: number;
  einnahmenYtdCents: number;
  ausgabenYtdCents: number;
  /** Net surplus/deficit YTD (einnahmen - ausgaben). */
  saldoCents: number;
  /** Monthly income totals, 12 entries (Jan=0 … Dec=11) for `year`. */
  einnahmenMonthlyCents: number[];
  /** Monthly expense totals, 12 entries (Jan=0 … Dec=11) for `year`. */
  ausgabenMonthlyCents: number[];
  /** Last-year YTD totals (same calendar window). */
  einnahmenLyYtdCents: number;
  ausgabenLyYtdCents: number;
  /** Open invoices (issued but bezahlt_am IS NULL, supersedesId IS NULL). */
  openInvoicesCount: number;
}

export interface DashboardKpis {
  /** Auslagen submissions with no decision yet (inbox). */
  openAuslagenCount: number;
  /** Expenses approved but not yet erstattet, with sum in cents. */
  approvedNotErstattetCount: number;
  approvedNotErstattetSumCents: bigint;
  /** Member_beitrags rows open in current Berlin year. */
  openBeitragsCount: number;
  openBeitragsMembers: number;
  /** Donations YTD (current Berlin year) sum in cents. */
  spendenYtdCents: bigint;
  /** Active members (no austrittsDatum). */
  activeMemberCount: number;
  /** WGB Freigrenze status for the WGBWidget. */
  wgb: WgbStatus;
  /** C3 cashflow overview (year-scoped headline + chips). */
  cashflow: CashflowOverview;
}

export interface RecentActivityEntry {
  id: string;
  occurredAt: Date;
  action: string;
  entityKind: string;
  entityBusinessId: string | null;
  actorKind: string;
  /** Human-readable label for the UI. */
  label: string;
}

// ---------------------------------------------------------------------------
// Berlin year helper (avoids circular import with spenden.ts)
// ---------------------------------------------------------------------------

export function berlinYear(now: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      year: "numeric",
    }).format(now),
    10,
  );
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/**
 * Year-over-year percentage delta of `cur` vs `prev`, rounded to nearest int.
 * Returns null when `prev` is non-positive (defensive — no signal to convey).
 */
export function computeLyDeltaPct(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Reduce `(month, sumCents)` rows into a length-12 array, 0-indexed (Jan=0).
 * Tolerates bigint / string sums returned by Postgres' SUM().
 */
export function bucketByMonth(
  rows: ReadonlyArray<{ month: number | string | bigint | null; sumCents: number | string | bigint | null }>,
): number[] {
  const out = new Array<number>(12).fill(0);
  for (const r of rows) {
    if (r.month === null || r.month === undefined) continue;
    const m = Number(r.month);
    if (!Number.isFinite(m) || m < 1 || m > 12) continue;
    const v = Number(r.sumCents ?? 0);
    if (!Number.isFinite(v)) continue;
    out[m - 1]! += v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// KPI queries
// ---------------------------------------------------------------------------

/**
 * Load all KPI values in parallel.
 *
 * @param year  Optional Buchhaltungsjahr to scope cashflow + WGB to.
 *              Defaults to the current Berlin year (year-switcher contract).
 *              The non-cashflow KPIs (open auslagen, recent activity etc.)
 *              are intentionally not year-scoped — they are "right now"
 *              counts.
 *
 * All money in integer cents; caller formats for display.
 */
export async function loadDashboardKpis(year?: number): Promise<DashboardKpis> {
  const db = getDb();
  const currentYear = year ?? berlinYear();

  // C3 LY same-period cutoff: for the *current* Berlin year we compare
  // Jan→current-Berlin-month vs Jan→same-month-last-year. For *past* years
  // we compare full Jan→Dec, so the cutoff is Dec.
  const nowYear = berlinYear();
  const ytdMonth =
    currentYear < nowYear
      ? 12
      : parseInt(
          new Intl.DateTimeFormat("en-US", {
            timeZone: "Europe/Berlin",
            month: "numeric",
          }).format(new Date()),
          10,
        );

  const [
    openAuslagen,
    approvedNotErstattet,
    openBeitragsAgg,
    spendenYtd,
    activeMembers,
    wgbEinnahmen,
    einnahmenMonthlyRows,
    ausgabenMonthlyRows,
    einnahmenLyRows,
    ausgabenLyRows,
    openInvoicesAgg,
  ] = await Promise.all([
    // 1. Open auslagen submissions (no decision yet)
    db
      .select({ value: count() })
      .from(auslagenSubmissions)
      .where(isNull(auslagenSubmissions.decidedAt)),

    // 2. Approved expenses not yet erstattet
    db
      .select({
        cnt: count(),
        sumCents: sum(expenses.betragCents),
      })
      .from(expenses)
      .where(
        and(
          isNotNull(expenses.approvedAt),
          isNull(expenses.erstattetAm),
          isNull(expenses.rejectedAt),
        ),
      ),

    // 3. Open beitrags (paid < due) for current year — count rows + distinct members
    db
      .select({
        rowCount: count(),
        memberCount: sql<number>`count(distinct ${memberBeitrags.memberId})`,
      })
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.year, currentYear),
          lt(memberBeitrags.paidCents, memberBeitrags.betragCents),
        ),
      ),

    // 4. Spenden YTD
    db
      .select({ sumCents: sum(donations.betragCents) })
      .from(donations)
      .where(eq(donations.yearOfBuchung, currentYear)),

    // 5. Active members
    db
      .select({ value: count() })
      .from(members)
      .where(isNull(members.austrittsDatum)),

    // 6. WGB Einnahmen YTD (wirtschaftlich sphere, current Berlin year)
    db
      .select({ sumCents: sum(income.betragCents) })
      .from(income)
      .where(
        and(
          eq(income.sphereSnapshot, "wirtschaftlich"),
          eq(income.yearOfBuchung, currentYear),
          isNull(income.supersedesId),
        ),
      ),

    // 7. C3 — Einnahmen monthly for selected year (income table, grouped by month)
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin')`,
        sumCents: sum(income.betragCents),
      })
      .from(income)
      .where(
        and(
          eq(income.yearOfBuchung, currentYear),
          isNull(income.supersedesId),
        ),
      )
      .groupBy(
        sql`EXTRACT(MONTH FROM ${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin')`,
      ),

    // 8. C3 — Ausgaben monthly for selected year
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${expenses.gebuchtAm} AT TIME ZONE 'Europe/Berlin')`,
        sumCents: sum(expenses.betragCents),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.yearOfBuchung, currentYear),
          isNull(expenses.supersedesId),
        ),
      )
      .groupBy(
        sql`EXTRACT(MONTH FROM ${expenses.gebuchtAm} AT TIME ZONE 'Europe/Berlin')`,
      ),

    // 9. C3 — Einnahmen LY same-period YTD (Jan..ytdMonth of currentYear-1)
    db
      .select({ sumCents: sum(income.betragCents) })
      .from(income)
      .where(
        and(
          eq(income.yearOfBuchung, currentYear - 1),
          isNull(income.supersedesId),
          sql`EXTRACT(MONTH FROM ${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin') <= ${ytdMonth}`,
        ),
      ),

    // 10. C3 — Ausgaben LY same-period YTD
    db
      .select({ sumCents: sum(expenses.betragCents) })
      .from(expenses)
      .where(
        and(
          eq(expenses.yearOfBuchung, currentYear - 1),
          isNull(expenses.supersedesId),
          sql`EXTRACT(MONTH FROM ${expenses.gebuchtAm} AT TIME ZONE 'Europe/Berlin') <= ${ytdMonth}`,
        ),
      ),

    // 11. C3 — Open invoices count (rechnungen with bezahlt_am IS NULL,
    //         non-superseded, current selected year).
    db
      .select({ value: count() })
      .from(invoices)
      .where(
        and(
          isNull(invoices.bezahltAm),
          isNull(invoices.supersedesId),
          eq(invoices.yearOfBuchung, currentYear),
        ),
      ),
  ]);

  // § 64 Abs. 3 AO Besteuerungsfreigrenze for wirtschaftlicher Geschäftsbetrieb:
  // 35.000 € until 2024, 45.000 € from 2024-01-01, 50.000 € from 2025-01-01
  // (JStG 2024). § 19 UStG Kleinunternehmer is separate (and has its own
  // thresholds of 25.000 / 100.000 € from 2025) — the WGB widget tracks
  // the gemeinnützigkeitsrechtliche Freigrenze, not the USt one. Money
  // review CRIT-5 (2026-05-19) flagged the obsolete 45.000 € constant.
  const FREIGRENZE_CENTS = 5_000_000; // 50.000 €, § 64 Abs. 3 AO (ab 2025)
  const wgbCents = Number(wgbEinnahmen[0]?.sumCents ?? 0);
  const wgbPct = wgbCents / FREIGRENZE_CENTS;
  const wgbStatus: WgbStatus["status"] =
    wgbCents >= FREIGRENZE_CENTS
      ? "ueberschritten"
      : wgbPct >= 0.8
        ? "kritisch"
        : wgbPct >= 0.5
          ? "erhoeht"
          : "ok";

  // C3 cashflow assembly
  const einnahmenMonthlyCents = bucketByMonth(einnahmenMonthlyRows);
  const ausgabenMonthlyCents = bucketByMonth(ausgabenMonthlyRows);
  const einnahmenYtdCents = einnahmenMonthlyCents.reduce((a, b) => a + b, 0);
  const ausgabenYtdCents = ausgabenMonthlyCents.reduce((a, b) => a + b, 0);

  return {
    openAuslagenCount: openAuslagen[0]?.value ?? 0,
    approvedNotErstattetCount: approvedNotErstattet[0]?.cnt ?? 0,
    approvedNotErstattetSumCents: BigInt(
      approvedNotErstattet[0]?.sumCents ?? 0,
    ),
    openBeitragsCount: openBeitragsAgg[0]?.rowCount ?? 0,
    openBeitragsMembers: Number(openBeitragsAgg[0]?.memberCount ?? 0),
    spendenYtdCents: BigInt(spendenYtd[0]?.sumCents ?? 0),
    activeMemberCount: activeMembers[0]?.value ?? 0,
    wgb: {
      einnahmenCents: wgbCents,
      freigrenzeCents: FREIGRENZE_CENTS,
      status: wgbStatus,
      year: currentYear,
    },
    cashflow: {
      year: currentYear,
      einnahmenYtdCents,
      ausgabenYtdCents,
      saldoCents: einnahmenYtdCents - ausgabenYtdCents,
      einnahmenMonthlyCents,
      ausgabenMonthlyCents,
      einnahmenLyYtdCents: Number(einnahmenLyRows[0]?.sumCents ?? 0),
      ausgabenLyYtdCents: Number(ausgabenLyRows[0]?.sumCents ?? 0),
      openInvoicesCount: openInvoicesAgg[0]?.value ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Recent activity feed
// ---------------------------------------------------------------------------

/** Friendly label builder for audit log actions */
function buildActivityLabel(
  action: string,
  entityKind: string,
  entityBusinessId: string | null,
): string {
  const entityStr = entityBusinessId ? ` ${entityBusinessId}` : "";

  const entityLabels: Record<string, string> = {
    expense: "Auslage",
    auslagen_submission: "Einreichung",
    donation: "Spende",
    member: "Mitglied",
    invoice: "Rechnung",
    income: "Einnahme",
    user: "Benutzer",
    project: "Projekt",
    customer: "Kunde",
    kategorie: "Kategorie",
    settings: "Einstellungen",
    zahlungsart: "Zahlungsart",
  };

  const actionLabels: Record<string, string> = {
    create: "erstellt",
    update: "bearbeitet",
    delete: "gelöscht",
    approve: "genehmigt",
    reject: "abgelehnt",
    reimburse: "erstattet",
    import: "importiert",
    festschreibung: "festgeschrieben",
    storno: "storniert",
    sign_in: "angemeldet",
    sign_out: "abgemeldet",
    magic_link_issue: "Magic Link erstellt",
    magic_link_verify: "Magic Link genutzt",
  };

  const entityLabel = entityLabels[entityKind] ?? entityKind;
  const actionLabel = actionLabels[action] ?? action;

  return `${entityLabel}${entityStr} ${actionLabel}`;
}

/**
 * Load last 10 audit_log entries for the recent activity feed.
 */
export async function loadRecentActivity(): Promise<RecentActivityEntry[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      entityKind: auditLog.entityKind,
      entityBusinessId: auditLog.entityBusinessId,
      actorKind: auditLog.actorKind,
    })
    .from(auditLog)
    .orderBy(desc(auditLog.occurredAt))
    .limit(10);

  return rows.map((row) => ({
    ...row,
    label: buildActivityLabel(row.action, row.entityKind, row.entityBusinessId),
  }));
}
