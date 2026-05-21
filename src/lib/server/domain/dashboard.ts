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
import { berlinYear } from "$lib/domain/year.js";

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
/**
 * Per-sphere split of an YTD total. ADR-0002: ideeller / vermoegen /
 * zweckbetrieb / wirtschaftlich. All cents.
 */
export interface SphereSplit {
  ideeller: number;
  vermoegen: number;
  zweckbetrieb: number;
  wirtschaftlich: number;
}

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
  /**
   * C3-3 (cycle 2): per-sphere YTD breakdown of einnahmen/ausgaben for the
   * "4 chips below each card" visual. Sums across income + donations +
   * member_beitrags for einnahmen; just expenses for ausgaben.
   */
  einnahmenBySphereCents: SphereSplit;
  ausgabenBySphereCents: SphereSplit;
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

// Re-exported at the top of the imports block so existing
// `import { berlinYear } from "$lib/server/domain/dashboard.js"` callers
// keep working. The canonical implementation lives in `$lib/domain/year.js`
// (ADR-0001).
export { berlinYear };

// ---------------------------------------------------------------------------
// Pure helpers — moved to $lib/domain/cashflow.ts in cycle 2 so the client
// bundle (LargeKpiCard) can use them without dragging Drizzle in. Re-exported
// here for backwards compatibility with the existing unit tests.
// ---------------------------------------------------------------------------

import {
  computeLyDeltaPct,
  bucketByMonth,
  clampMonthlyForCurrentYear,
} from "$lib/domain/cashflow.js";

export { computeLyDeltaPct, bucketByMonth, clampMonthlyForCurrentYear };

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
    incomeMonthlyRows,
    donationsMonthlyRows,
    beitragsMonthlyRows,
    ausgabenMonthlyRows,
    incomeLyRows,
    donationsLyRows,
    beitragsLyRows,
    ausgabenLyRows,
    openInvoicesAgg,
    incomeBySphereRows,
    donationsBySphereRows,
    expensesBySphereRows,
    beitragsYtdAgg,
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

    // 7. C3 — Einnahmen monthly (income table only) for selected year
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin')`,
        sumCents: sum(income.betragCents),
      })
      .from(income)
      .where(
        and(eq(income.yearOfBuchung, currentYear), isNull(income.supersedesId)),
      )
      .groupBy(
        sql`EXTRACT(MONTH FROM ${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin')`,
      ),

    // 8. C3-1 — Donations monthly for selected year (ideeller sphere; counts
    //          as Einnahme on the dashboard cashflow even though it's a
    //          separate table from `income`).
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${donations.gebuchtAm} AT TIME ZONE 'Europe/Berlin')`,
        sumCents: sum(donations.betragCents),
      })
      .from(donations)
      .where(
        and(
          eq(donations.yearOfBuchung, currentYear),
          isNull(donations.supersedesId),
        ),
      )
      .groupBy(
        sql`EXTRACT(MONTH FROM ${donations.gebuchtAm} AT TIME ZONE 'Europe/Berlin')`,
      ),

    // 9. C3-1 — Mitgliedsbeiträge monthly for selected year.
    //   Bucketed by `gezahlt_am` (when actually paid; null = not yet paid,
    //   excluded). For unpaid beitrags we have no realized cashflow, so the
    //   dashboard's einnahmen YTD correctly excludes them — they show up in
    //   the "offene Beiträge" KPI instead.
    db
      .select({
        month: sql<number>`EXTRACT(MONTH FROM ${memberBeitrags.gezahltAm} AT TIME ZONE 'Europe/Berlin')`,
        sumCents: sum(memberBeitrags.paidCents),
      })
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.year, currentYear),
          isNotNull(memberBeitrags.gezahltAm),
        ),
      )
      .groupBy(
        sql`EXTRACT(MONTH FROM ${memberBeitrags.gezahltAm} AT TIME ZONE 'Europe/Berlin')`,
      ),

    // 10. C3 — Ausgaben monthly for selected year
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

    // 11. C3 — Einnahmen LY same-period YTD: income table (Jan..ytdMonth of currentYear-1)
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

    // 12. C3-1 — Donations LY same-period YTD
    db
      .select({ sumCents: sum(donations.betragCents) })
      .from(donations)
      .where(
        and(
          eq(donations.yearOfBuchung, currentYear - 1),
          isNull(donations.supersedesId),
          sql`EXTRACT(MONTH FROM ${donations.gebuchtAm} AT TIME ZONE 'Europe/Berlin') <= ${ytdMonth}`,
        ),
      ),

    // 13. C3-1 — Mitgliedsbeiträge LY same-period YTD (by gezahlt_am month)
    db
      .select({ sumCents: sum(memberBeitrags.paidCents) })
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.year, currentYear - 1),
          isNotNull(memberBeitrags.gezahltAm),
          sql`EXTRACT(MONTH FROM ${memberBeitrags.gezahltAm} AT TIME ZONE 'Europe/Berlin') <= ${ytdMonth}`,
        ),
      ),

    // 14. C3 — Ausgaben LY same-period YTD
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

    // 15. C3 — Open invoices count (rechnungen with bezahlt_am IS NULL,
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

    // 16. C3-3 — Income YTD grouped by sphere
    db
      .select({
        sphere: income.sphereSnapshot,
        sumCents: sum(income.betragCents),
      })
      .from(income)
      .where(
        and(eq(income.yearOfBuchung, currentYear), isNull(income.supersedesId)),
      )
      .groupBy(income.sphereSnapshot),

    // 17. C3-3 — Donations YTD grouped by sphere
    db
      .select({
        sphere: donations.sphereSnapshot,
        sumCents: sum(donations.betragCents),
      })
      .from(donations)
      .where(
        and(
          eq(donations.yearOfBuchung, currentYear),
          isNull(donations.supersedesId),
        ),
      )
      .groupBy(donations.sphereSnapshot),

    // 18. C3-3 — Expenses YTD grouped by sphere
    db
      .select({
        sphere: expenses.sphereSnapshot,
        sumCents: sum(expenses.betragCents),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.yearOfBuchung, currentYear),
          isNull(expenses.supersedesId),
        ),
      )
      .groupBy(expenses.sphereSnapshot),

    // 19. C3-3 — Member-beitrags YTD (always ideeller sphere)
    db
      .select({ sumCents: sum(memberBeitrags.paidCents) })
      .from(memberBeitrags)
      .where(
        and(
          eq(memberBeitrags.year, currentYear),
          isNotNull(memberBeitrags.gezahltAm),
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
  // Threshold tiers (C4-DASH-lite cycle 2 — vorstand-treasurer finding #4):
  // For a <€25k Verein, the §64-Freigrenze (€50k) is structurally distant.
  // 50% is the normal operating zone — flagging it as "erhoeht" is alarm
  // fatigue. Tiers below match the cliff-warning model: ok up to 80%,
  // erhoeht 80-95% (approaching), kritisch 95-100% (very close),
  // ueberschritten >= 100%. The WGBWidget chip renders only on `ok`, so
  // the dashboard now stays scannable until the warning is actionable.
  const wgbStatus: WgbStatus["status"] =
    wgbCents >= FREIGRENZE_CENTS
      ? "ueberschritten"
      : wgbPct >= 0.95
        ? "kritisch"
        : wgbPct >= 0.8
          ? "erhoeht"
          : "ok";

  // C3 cashflow assembly.
  // C3-1 (cycle 2): Einnahmen = income + donations + member_beitrags(paid)
  //   sum element-wise into one Jan..Dec series. Same for YTD and LY YTD.
  const incomeMonthly = bucketByMonth(incomeMonthlyRows);
  const donationsMonthly = bucketByMonth(donationsMonthlyRows);
  const beitragsMonthly = bucketByMonth(beitragsMonthlyRows);
  const einnahmenMonthlyCents = incomeMonthly.map(
    (v, i) => v + (donationsMonthly[i] ?? 0) + (beitragsMonthly[i] ?? 0),
  );
  const ausgabenMonthlyCents = bucketByMonth(ausgabenMonthlyRows);
  const einnahmenYtdCents = einnahmenMonthlyCents.reduce((a, b) => a + b, 0);
  const ausgabenYtdCents = ausgabenMonthlyCents.reduce((a, b) => a + b, 0);
  const einnahmenLyYtdCents =
    Number(incomeLyRows[0]?.sumCents ?? 0) +
    Number(donationsLyRows[0]?.sumCents ?? 0) +
    Number(beitragsLyRows[0]?.sumCents ?? 0);

  // C3-3: per-sphere YTD splits. Income + donations are sphere-tagged
  // (sphere_snapshot); expenses similarly. Member-beitrags are always
  // ideeller (no sphere column on the table).
  const bucketBySphere = (
    rows: ReadonlyArray<{ sphere: string | null; sumCents: unknown }>,
  ): SphereSplit => {
    const out: SphereSplit = {
      ideeller: 0,
      vermoegen: 0,
      zweckbetrieb: 0,
      wirtschaftlich: 0,
    };
    for (const r of rows) {
      const s = r.sphere as keyof SphereSplit | null;
      if (s === null || s === undefined) continue;
      if (s in out) out[s] += Number(r.sumCents ?? 0);
    }
    return out;
  };

  const einnahmenBySphereCents = bucketBySphere(incomeBySphereRows);
  const donationsSplit = bucketBySphere(donationsBySphereRows);
  einnahmenBySphereCents.ideeller += donationsSplit.ideeller;
  einnahmenBySphereCents.vermoegen += donationsSplit.vermoegen;
  einnahmenBySphereCents.zweckbetrieb += donationsSplit.zweckbetrieb;
  einnahmenBySphereCents.wirtschaftlich += donationsSplit.wirtschaftlich;
  // Member-beitrags always count as ideeller.
  einnahmenBySphereCents.ideeller += Number(beitragsYtdAgg[0]?.sumCents ?? 0);

  const ausgabenBySphereCents = bucketBySphere(expensesBySphereRows);

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
      einnahmenLyYtdCents,
      ausgabenLyYtdCents: Number(ausgabenLyRows[0]?.sumCents ?? 0),
      openInvoicesCount: openInvoicesAgg[0]?.value ?? 0,
      einnahmenBySphereCents,
      ausgabenBySphereCents,
    },
  };
}

// ---------------------------------------------------------------------------
// Recent activity feed
// ---------------------------------------------------------------------------

/**
 * Friendly label builder for audit log actions.
 *
 * Exported for the C4-DASH-lite unit test (entityLabels.session = "Sitzung").
 */
export function buildActivityLabel(
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
    session: "Sitzung",
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
