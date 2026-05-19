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
// KPI queries
// ---------------------------------------------------------------------------

/**
 * Load all KPI values in parallel.
 * All money in integer cents; caller formats for display.
 */
export async function loadDashboardKpis(): Promise<DashboardKpis> {
  const db = getDb();
  const currentYear = berlinYear();

  const [
    openAuslagen,
    approvedNotErstattet,
    openBeitragsAgg,
    spendenYtd,
    activeMembers,
    wgbEinnahmen,
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
  ]);

  const FREIGRENZE_CENTS = 4_500_000; // §19 UStG: 45.000 € gross
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
