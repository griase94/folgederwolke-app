/**
 * C1 EÜR data shape extensions — pure helpers consumed by the tabbed
 * /app/jahresabschluss/[year] workspace (Übersicht tab).
 *
 * No DB access in this file — server-side load functions fetch + aggregate,
 * then call these helpers. Same separation as cashflow.ts vs dashboard.ts.
 *
 * Conventions:
 *   - Money in integer cents (ADR-0003). External callers can pass bigint
 *     because Postgres' SUM() returns bigint; we coerce to number internally.
 *   - Sphere order is stable (ideeller, vermoegen, zweckbetrieb, wirtschaftlich)
 *     and matches src/lib/server/domain/eur.ts SPHERES + SPHERE_LABELS.
 *   - WGB-Freigrenze constant per C1 spec (45.000 €). Note the existing
 *     EurSummary legal note mentions 50.000 € (§ 64 Abs. 3 AO ab 2025) —
 *     the C1 spec explicitly calls out 45.000 € as the displayed threshold.
 *     If finding revisits this, swap the constant; everything downstream
 *     reads from WGB_FREIGRENZE_CENTS.
 *
 * Resolves: VB-001, JB-007, UX-100, UI-002, UI-034 (server side).
 */

import { SPHERES, type Sphere } from "$lib/server/domain/eur.js";

// ── YoY delta ────────────────────────────────────────────────────────────────

export interface YoyDelta {
  /** Absolute delta in cents (current - prior). */
  absCents: number;
  /** Percentage delta rounded to nearest int, or null when prior is non-positive. */
  pct: number | null;
}

/**
 * Year-over-year comparison of two cent values. Mirrors the policy of
 * `computeLyDeltaPct` in `$lib/domain/cashflow.ts` (null pct on
 * non-positive prior — no signal to convey), but returns absCents too
 * so the UI can render a "+€500" chip even when pct is hidden.
 */
export function computeYoYDelta(
  currentCents: number,
  priorCents: number,
): YoyDelta {
  const absCents = currentCents - priorCents;
  if (priorCents <= 0) {
    return { absCents, pct: null };
  }
  const pct = Math.round(((currentCents - priorCents) / priorCents) * 100);
  return { absCents, pct };
}

// ── Sphere YoY breakdown ─────────────────────────────────────────────────────

export interface SphereTotals {
  einnahmenCents: number;
  ausgabenCents: number;
  ueberschussCents: number;
}

export type SphereTotalsByYear = Record<Sphere, SphereTotals>;

export interface SphereYoYRow {
  sphere: Sphere;
  einnahmenCents: number;
  ausgabenCents: number;
  ueberschussCents: number;
  /** YoY delta on Einnahmen — for the +/- chip in the Übersicht table. */
  yoyEinnahmen: YoyDelta;
  /** YoY delta on Ausgaben. */
  yoyAusgaben: YoyDelta;
  /** YoY delta on Überschuss — the headline figure of the row. */
  yoyUeberschuss: YoyDelta;
}

/**
 * Combine per-sphere totals from two years into a 4-row YoY table.
 * Returned in the canonical SPHERES order.
 */
export function computeSphereYoY(
  current: SphereTotalsByYear,
  prior: SphereTotalsByYear,
): SphereYoYRow[] {
  return SPHERES.map((sphere) => {
    const cur = current[sphere];
    const prv = prior[sphere];
    return {
      sphere,
      einnahmenCents: cur.einnahmenCents,
      ausgabenCents: cur.ausgabenCents,
      ueberschussCents: cur.ueberschussCents,
      yoyEinnahmen: computeYoYDelta(cur.einnahmenCents, prv.einnahmenCents),
      yoyAusgaben: computeYoYDelta(cur.ausgabenCents, prv.ausgabenCents),
      yoyUeberschuss: computeYoYDelta(
        cur.ueberschussCents,
        prv.ueberschussCents,
      ),
    };
  });
}

// ── Monthly Überschuss bucket ────────────────────────────────────────────────

export interface MonthlyRow {
  art: "income" | "expense";
  /** 1..12 (Jan=1). */
  month: number | string | bigint | null;
  /** Sum of betrag_cents for the (art, month) tuple. */
  sumCents: number | string | bigint | null;
}

/**
 * Bucket pre-aggregated (art, month, SUM(betrag_cents)) rows into a length-12
 * Überschuss series — Einnahmen − Ausgaben per month, suitable for the
 * Sparkline component. Same shape as `bucketByMonth` in cashflow.ts but
 * collapses income/expense in a single pass.
 */
export function computeMonthlyOverschuss(
  rows: ReadonlyArray<MonthlyRow>,
): number[] {
  const out = new Array<number>(12).fill(0);
  for (const r of rows) {
    if (r.month === null || r.month === undefined) continue;
    const m = Number(r.month);
    if (!Number.isFinite(m) || m < 1 || m > 12) continue;
    const v = Number(r.sumCents ?? 0);
    if (!Number.isFinite(v)) continue;
    const idx = m - 1;
    if (r.art === "income") {
      out[idx]! += v;
    } else if (r.art === "expense") {
      out[idx]! -= v;
    }
  }
  return out;
}

// ── WGB-Freigrenze status ────────────────────────────────────────────────────

/**
 * Freigrenze für den wirtschaftlichen Geschäftsbetrieb (§ 64 Abs. 3 AO).
 * Per C1 spec: 45.000 € → 4_500_000 cents.
 *
 * NOTE: the existing EurSummary.svelte legal-note text mentions 50.000 €
 * (the threshold from 2025 onwards under the most recent AO amendment).
 * The C1 spec explicitly calls out 45.000 €; we use that here so the
 * indicator and legal note can be reconciled in a later cluster pass.
 */
export const WGB_FREIGRENZE_CENTS = 4_500_000n;

export type WgbBucket = "safe" | "warning" | "over";

export interface WgbStatus {
  thresholdCents: number;
  einnahmenCents: number;
  /** thresholdCents − einnahmenCents (negative when over). */
  remainingCents: number;
  bucket: WgbBucket;
}

/**
 * Classify wirtschaftliche Einnahmen against the Freigrenze:
 *   - safe:    < 80% of threshold
 *   - warning: ≥ 80% and < 100%
 *   - over:    ≥ 100%
 *
 * The 80% guardrail mirrors common Vereinsbuchhalter UX — give the
 * Treasurer time to react before the year actually breaches the limit.
 */
export function computeWgbStatus(
  wirtschaftlichEinnahmenCents: number,
): WgbStatus {
  const threshold = Number(WGB_FREIGRENZE_CENTS);
  const ratio = wirtschaftlichEinnahmenCents / threshold;
  let bucket: WgbBucket;
  if (ratio >= 1) bucket = "over";
  else if (ratio >= 0.8) bucket = "warning";
  else bucket = "safe";
  return {
    thresholdCents: threshold,
    einnahmenCents: wirtschaftlichEinnahmenCents,
    remainingCents: threshold - wirtschaftlichEinnahmenCents,
    bucket,
  };
}

// ── Pre-flight checklist ─────────────────────────────────────────────────────

export type PreFlightStatus = "pass" | "warn" | "block";

export interface PreFlightItem {
  id: string;
  label: string;
  status: PreFlightStatus;
  /** Human-readable detail line shown under the label. */
  detail: string;
}

export interface PreFlightChecklist {
  items: PreFlightItem[];
  canFestschreiben: boolean;
  warnings: number;
  blockers: number;
}

export interface PreFlightInput {
  year: number;
  uncategorizedCount: number;
  missingBelegCount: number;
  draftInvoiceCount: number;
  auditInboxQueueCount: number;
  /** From settings.festgeschrieben_bis — null when never set. */
  festgeschriebenBis: number | null;
  totalIncomeRows: number;
  totalExpenseRows: number;
}

/**
 * Build the 5-item pre-flight checklist gating the Festschreibung button on
 * the Übersicht tab. Blockers prevent close; warnings show a yellow chip but
 * canFestschreiben stays true.
 *
 * Item map:
 *   1. uncategorized  — block when > 0 (orphan EÜR rows can't be filed)
 *   2. missingBelege  — warn when > 0 (receipts can arrive after close)
 *   3. draftInvoices  — block when > 0 (drafts must be finalized first)
 *   4. auditInbox     — block when > 0 (queue items might affect EÜR)
 *   5. alreadyClosed  — block when festgeschriebenBis >= year
 */
export function computePreFlight(input: PreFlightInput): PreFlightChecklist {
  const items: PreFlightItem[] = [];

  // 1. Uncategorized rows
  if (input.uncategorizedCount > 0) {
    items.push({
      id: "uncategorized",
      label: "Unkategorisierte Buchungen",
      status: "block",
      detail: `${input.uncategorizedCount} Buchung${
        input.uncategorizedCount === 1 ? "" : "en"
      } ohne Kategorie. Bitte zuordnen, bevor das Jahr festgeschrieben wird.`,
    });
  } else {
    items.push({
      id: "uncategorized",
      label: "Unkategorisierte Buchungen",
      status: "pass",
      detail: "Alle Buchungen sind einer Kategorie zugeordnet.",
    });
  }

  // 2. Missing Belege
  if (input.missingBelegCount > 0) {
    items.push({
      id: "missingBelege",
      label: "Fehlende Belege",
      status: "warn",
      detail: `${input.missingBelegCount} Buchung${
        input.missingBelegCount === 1 ? "" : "en"
      } ohne Beleg-Datei. Festschreibung weiterhin möglich, aber Belege später nachreichen.`,
    });
  } else {
    items.push({
      id: "missingBelege",
      label: "Fehlende Belege",
      status: "pass",
      detail: "Alle Buchungen haben einen Beleg hinterlegt.",
    });
  }

  // 3. Draft invoices
  if (input.draftInvoiceCount > 0) {
    items.push({
      id: "draftInvoices",
      label: "Entwürfe von Rechnungen",
      status: "block",
      detail: `${input.draftInvoiceCount} Rechnung${
        input.draftInvoiceCount === 1 ? "" : "en"
      } im Entwurfsstatus. Bitte finalisieren oder verwerfen.`,
    });
  } else {
    items.push({
      id: "draftInvoices",
      label: "Entwürfe von Rechnungen",
      status: "pass",
      detail: "Keine Rechnungs-Entwürfe offen.",
    });
  }

  // 4. Audit-inbox queue
  if (input.auditInboxQueueCount > 0) {
    items.push({
      id: "auditInbox",
      label: "Audit-Inbox-Warteschlange",
      status: "block",
      detail: `${input.auditInboxQueueCount} Eintr${
        input.auditInboxQueueCount === 1 ? "ag" : "äge"
      } in der Audit-Inbox. Bitte zuerst freigeben oder ablehnen.`,
    });
  } else {
    items.push({
      id: "auditInbox",
      label: "Audit-Inbox-Warteschlange",
      status: "pass",
      detail: "Audit-Inbox ist leer.",
    });
  }

  // 5. Already closed
  if (
    input.festgeschriebenBis !== null &&
    input.festgeschriebenBis >= input.year
  ) {
    items.push({
      id: "alreadyClosed",
      label: "Jahr-Status",
      status: "block",
      detail: `Buchungsjahr ${input.year} ist bereits festgeschrieben (festgeschrieben_bis = ${input.festgeschriebenBis}).`,
    });
  } else {
    items.push({
      id: "alreadyClosed",
      label: "Jahr-Status",
      status: "pass",
      detail:
        input.festgeschriebenBis === null
          ? "Bisher kein Jahr festgeschrieben."
          : `Letztes festgeschriebenes Jahr: ${input.festgeschriebenBis}.`,
    });
  }

  const blockers = items.filter((i) => i.status === "block").length;
  const warnings = items.filter((i) => i.status === "warn").length;

  return {
    items,
    canFestschreiben: blockers === 0,
    warnings,
    blockers,
  };
}
