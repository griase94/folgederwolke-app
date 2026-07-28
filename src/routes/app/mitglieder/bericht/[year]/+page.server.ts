/**
 * /app/mitglieder/bericht/[year] — printable Kassenbericht (spec §11 / §4.4).
 *
 * C-Lane resolver swap (D2): the per-member status now comes from the canonical
 * `resolveBeitragState` resolver — the SAME source the Matrix, Detail and
 * Reminder-Guard use — so the Bericht can honestly show Überfällig + Teilzahlung
 * and never contradicts the Matrix header (one ledger, one truth). The previous
 * paid|open|exempt derivation (with a fabricated VEREIN_BEITRAG_DEFAULT_CENTS
 * fallback) is gone: no-row / no-Satz members carry 0 € instead of an invented
 * Soll.
 *
 * Totals rule (§5): "Offen" = open + partial + overdue outstanding; "davon
 * überfällig" is the overdue subset shown as a footnote. Amber discipline (§7.3):
 * only Überfällig is amber — merely-open is neutral.
 *
 * Auth: admin (Vorstand) + steuerberater (Kassenprüfer), defense-in-depth
 * (ADR-0009). Read-only.
 */

import { error } from "@sveltejs/kit";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { resolveBeitragState } from "$lib/domain/beitrag-state.js";

/** The seven honest report states (via resolveBeitragState). */
export type BerichtStatus =
  | "paid"
  | "partial"
  | "open"
  | "overdue"
  | "exempt"
  | "permanently_exempt"
  | "not_applicable";

export type BerichtRow = {
  memberId: string;
  /** "Nachname, Vorname" — Kassenprüfer sort order. */
  name: string;
  eintrittsDatum: string | null;
  status: BerichtStatus;
  /** Soll in cents (0 for satz-missing / not_applicable — never fabricated). */
  betragCents: number;
  paidCents: number;
  gezahltAm: string | null;
  /** Befreiungs-Grund OR payment note. */
  anmerkung: string | null;
};

export type BerichtTotals = {
  paidCount: number;
  paidSumCents: number;
  /** open + partial + overdue members and their outstanding sum. */
  openCount: number;
  openSumCents: number;
  /** The overdue subset ("davon überfällig"). */
  overdueCount: number;
  overdueSumCents: number;
  exemptCount: number;
  totalMembers: number;
};

/** Parse settings.festgeschrieben_bis (jsonb year int or JSON-string). */
function parseSettingYear(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export const load: PageServerLoad = async ({ params, locals }) => {
  // Defense-in-depth (ADR-0009): the Kassenbericht exposes every member's
  // payment status, so gate it explicitly to Vorstand (admin) + Kassenprüfer
  // (steuerberater) rather than relying solely on the session allowlist.
  const role = locals.session?.user.role;
  if (role !== "admin" && role !== "steuerberater") {
    error(
      403,
      "Nur Vorstand und Kassenprüfer dürfen den Kassenbericht öffnen.",
    );
  }

  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const db = getDb();

  // ── Settings needed by the resolver (shared basis with the Matrix so the
  //    numbers reconcile: same festBis, same graceDays, same faelligkeit). ──
  const settingRows = (await db.execute(sql`
    SELECT key, value FROM settings
     WHERE key IN ('festgeschrieben_bis', 'beitrag.overdue_grace_days')
  `)) as { key: string; value: unknown }[];
  let festBis: number | null = null;
  let graceDays = 60;
  for (const r of settingRows) {
    if (r.key === "festgeschrieben_bis") festBis = parseSettingYear(r.value);
    else if (r.key === "beitrag.overdue_grace_days") {
      const g = parseSettingYear(r.value);
      if (g !== null) graceDays = g;
    }
  }
  const isLockedYear = festBis !== null && year <= festBis;

  // Load the Beitragssatz + Fälligkeit for this year (may be null if never set).
  const [satz] = await db
    .select({
      cents: beitragssatzByYear.cents,
      faelligkeitAt: beitragssatzByYear.faelligkeitAt,
    })
    .from(beitragssatzByYear)
    .where(eq(beitragssatzByYear.year, year));
  const satzCents = satz ? Number(satz.cents) : null;

  // Load all members (including ausgetretene — the report covers whoever was
  // active in that year, or had a Beitrag row, not just current members).
  const allMembers = await db
    .select({
      id: members.id,
      vorname: members.vorname,
      nachname: members.nachname,
      eintrittsDatum: members.eintrittsDatum,
      austrittsDatum: members.austrittsDatum,
      beitragExempt: members.beitragExempt,
      beitragExemptReason: members.beitragExemptReason,
    })
    .from(members)
    .orderBy(members.nachname, members.vorname);

  const memberIds = allMembers.map((m) => m.id);

  // Load all Beitrag rows for this year.
  let beitragRows: (typeof memberBeitrags.$inferSelect)[] = [];
  if (memberIds.length > 0) {
    beitragRows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          inArray(memberBeitrags.memberId, memberIds),
          eq(memberBeitrags.year, year),
        ),
      );
  }
  const beitragMap = new Map(beitragRows.map((b) => [b.memberId, b]));

  // ── Derive each member's canonical state ──────────────────────────────────
  const rows: BerichtRow[] = [];
  for (const m of allMembers) {
    const eintrittsJahr = m.eintrittsDatum
      ? parseInt(m.eintrittsDatum.slice(0, 4), 10)
      : 0;
    const austrittsJahr = m.austrittsDatum
      ? parseInt(m.austrittsDatum.slice(0, 4), 10)
      : null;

    const beitrag = beitragMap.get(m.id);
    const row = beitrag
      ? {
          betragCents: Number(beitrag.betragCents),
          paidCents: Number(beitrag.paidCents),
          isExempt: beitrag.isExempt ?? false,
          gezahltAm: beitrag.gezahltAm ?? null,
        }
      : null;

    const resolved = resolveBeitragState({
      year,
      eintrittsJahr,
      austrittsJahr,
      beitragExempt: m.beitragExempt,
      row,
      satzCents,
      festBis,
      faelligkeit: satz?.faelligkeitAt ?? undefined,
      graceDays,
    });

    // Members who weren't in the club during this year (pre-join / post-Austritt)
    // don't belong on the year's Kassenbericht — skip them so `totalMembers`
    // reflects the year's applicable roster (Kanon: 7 Mitglieder für 2026).
    // (`locked_year` is a legacy CellState the resolver never returns — narrowed
    // out here so `status` is the six report states.)
    if (
      resolved.state === "not_applicable_pre_join" ||
      resolved.state === "not_applicable_post_austritt" ||
      resolved.state === "locked_year"
    ) {
      continue;
    }
    // M6: no Beitragssatz configured for the year AND no recorded payment row →
    // the member has NO defined obligation for the year, so they don't belong on
    // the owing roster. Without this, resolveBeitragState returns "overdue"
    // (past the default Fälligkeit) with betragCents=0 → a phantom "Überfällig
    // 0,00 €" that reads as invented debt. The year-level satzMissing hint
    // explains the empty/short roster. (Years WITH a Satz — e.g. the migration-
    // 0026 pre-seeded 2020–2027 — are unaffected: their debt is real, not fabricated.)
    if (satzCents === null && !beitrag) {
      continue;
    }
    const status = resolved.state;

    const isExemptState =
      status === "exempt" || status === "permanently_exempt";
    const exemptReason =
      status === "permanently_exempt"
        ? (m.beitragExemptReason ?? null)
        : status === "exempt"
          ? (beitrag?.exemptReason ?? null)
          : null;

    rows.push({
      memberId: m.id,
      name: `${m.nachname}, ${m.vorname}`,
      eintrittsDatum: m.eintrittsDatum ?? null,
      status,
      betragCents: resolved.betragCents,
      paidCents: resolved.paidCents,
      gezahltAm: beitrag?.gezahltAm ?? null,
      anmerkung: isExemptState ? exemptReason : (beitrag?.notes ?? null),
    });
  }

  // ── Totals (§5 aggregate rule) ────────────────────────────────────────────
  const outstanding = (r: BerichtRow) =>
    Math.max(r.betragCents - r.paidCents, 0);
  const paidRows = rows.filter((r) => r.status === "paid");
  const overdueRows = rows.filter((r) => r.status === "overdue");
  const openLikeRows = rows.filter(
    (r) =>
      r.status === "open" || r.status === "partial" || r.status === "overdue",
  );
  const exemptRows = rows.filter(
    (r) => r.status === "exempt" || r.status === "permanently_exempt",
  );

  const totals: BerichtTotals = {
    paidCount: paidRows.length,
    paidSumCents: paidRows.reduce((s, r) => s + r.paidCents, 0),
    openCount: openLikeRows.length,
    openSumCents: openLikeRows.reduce((s, r) => s + outstanding(r), 0),
    overdueCount: overdueRows.length,
    overdueSumCents: overdueRows.reduce((s, r) => s + outstanding(r), 0),
    exemptCount: exemptRows.length,
    totalMembers: rows.length,
  };

  // ── Trust-line timestamp (only meaningful for a locked year) ──────────────
  // The close function stamps every booking row's festgeschrieben_at with the
  // same `now()`, so MAX across the four booking tables is the close moment.
  // Null when the year is unlocked or had no bookings (trust-line still renders
  // via isLockedYear, just without a date).
  let festgeschriebenAm: string | null = null;
  if (isLockedYear) {
    const fgRows = (await db.execute(sql`
      SELECT MAX(fa)::text AS ts FROM (
        SELECT festgeschrieben_at AS fa FROM income     WHERE year_of_buchung = ${year} AND festgeschrieben_at IS NOT NULL
        UNION ALL SELECT festgeschrieben_at FROM expenses  WHERE year_of_buchung = ${year} AND festgeschrieben_at IS NOT NULL
        UNION ALL SELECT festgeschrieben_at FROM donations WHERE year_of_buchung = ${year} AND festgeschrieben_at IS NOT NULL
        UNION ALL SELECT festgeschrieben_at FROM invoices  WHERE year_of_buchung = ${year} AND festgeschrieben_at IS NOT NULL
      ) x
    `)) as { ts: string | null }[];
    festgeschriebenAm = fgRows[0]?.ts ?? null;
  }

  return {
    year,
    faelligkeitAt: satz?.faelligkeitAt ?? null,
    satzCents,
    /** True when no Beitragssatz is configured for the year (show hint, not fabricated Soll). */
    satzMissing: satzCents === null,
    festgeschriebenBis: festBis,
    isLockedYear,
    festgeschriebenAm,
    rows,
    totals,
  };
};
