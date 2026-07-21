/**
 * Domain helpers for the merged Transactions view (Phase 5).
 *
 * Exports:
 *  - listTransaktionenFeedPage: Aurora UNION-ALL unified feed (slice 5) — also serves the Jahresabschluss Buchungsliste + transactions.csv.
 *  - getTransactionDetail: single-row detail with audit_log timeline.
 *  - listZahlungsarten: for dropdowns.
 *  - deriveSphere: from sphere_override (pre-Festschreibung) else sphere_snapshot.
 *
 * No schema changes — read-only queries only (§5.4 spec).
 */

import { and, asc, desc, eq, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { files } from "$lib/server/db/schema/files.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { deriveDonationKategorieName } from "$lib/domain/spenden-kategorie.js";
import type { Sphere } from "$lib/domain/sphere.js";
import { zahlungsarten } from "$lib/server/db/schema/zahlungsarten.js";
import { members } from "$lib/server/db/schema/members.js";
import { bus } from "$lib/server/events/index.js";
import type { YearScope } from "$lib/domain/year.js";
import { isUuid } from "$lib/domain/uuid.js";
import type { FilterState } from "$lib/domain/transaction-filters.js";
import {
  buildAusgabenWhere,
  buildEinnahmenWhere,
  buildSpendenWhere,
} from "$lib/server/domain/transaction-filter-sql.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransactionKind = "expense" | "income" | "donation";

export interface TransactionRow {
  id: string;
  kind: TransactionKind;
  businessId: string;
  bezeichnung: string;
  betragCents: number;
  currency: string;
  gebuchtAm: string;
  /**
   * The cash-relevant date (= relevanz_datum): abfluss_datum for expenses,
   * geld_eingang_datum for income, zugewendet_am for donations. ISO
   * `YYYY-MM-DD` or null. Migration 0034 derives year_of_buchung from
   * COALESCE(<cash>, gebucht_am), so the flat transactions CSV + Buchungsliste
   * sort/emit COALESCE(relevanzDatum, gebuchtAm) — keeping the emitted Datum
   * inside the cash-year fiscal window the row was SELECTed into.
   */
  relevanzDatum: string | null;
  /** ISO date string YYYY-MM-DD or null */
  rechnungsdatum: string | null;
  sphereSnapshot: string;
  sphereEffective: string;
  kategorieNameSnapshot: string;
  /** #115: the Kategorie FK — lets the edit forms pre-select the picker by id. */
  kategorieId: string | null;
  /** expense only */
  status: string | null;
  erstattetAm: string | null;
  bezahltVonDisplay: string | null;
  festgeschriebenAt: string | null;
  yearOfBuchung: number | null;
}

export interface AuditTimelineEntry {
  id: string;
  occurredAt: string;
  action: string;
  actorKind: string;
  actorUserId: string | null;
  payload: Record<string, unknown> | null;
}

export interface TransactionDetail extends TransactionRow {
  kommentar: string | null;
  projectId: string | null;
  zahlungsartId: string | null;
  /** expense only */
  externIban: string | null;
  externEmail: string | null;
  externName: string | null;
  bezahltVonMemberId: string | null;
  belegDriveFileId: string | null;
  /**
   * Beleg metadata (all kinds). `belegFileId` is the FK into the normalized
   * `files` table; `belegMimeType`/`belegOriginalName` are LEFT-JOINed off
   * that row (`files.mime_type` / `files.original_filename`) — NOT the legacy
   * `beleg_drive_file_id` / `beleg_original_name` text columns. All three are
   * null when no Beleg is attached. The §11 BelegViewer (Phase 5) binds to
   * `belegFileId`/`belegMimeType`/`belegOriginalName`.
   */
  belegFileId: string | null;
  belegMimeType: string | null;
  belegOriginalName: string | null;
  /** expense only — no Beleg AND no begründeter Verzicht (feed „Beleg fehlt"). */
  belegFehlt: boolean;
  /** donation only — the Zuwendungsbestätigung issue date (ISO), when issued. */
  bescheinigungDatum: string | null;
  approvedAt: string | null;
  /**
   * income only — the aus-Rechnung link: the linked Ausgangsrechnung's
   * `business_id` via the correlated subquery `invoices.paid_by_income_id =
   * income.id` (same source as the Phase-2 Einnahmen list projection). null
   * for non-invoice-linked income. Phase 5's read-only "aus Rechnung FDW-…"
   * detail context reads this off `detail` so it never imports `invoices`.
   */
  rechnungBusinessId: string | null;
  /**
   * income only — the linked Ausgangsrechnung's ROUTE id (invoices.id), the
   * same correlated source as `rechnungBusinessId`. Lets the detail "aus
   * Rechnung" line link straight to `/app/rechnungen/{rechnungId}` (which keys
   * on invoices.id). null for unlinked income (the detail then degrades the
   * link to the Rechnungen overview).
   */
  rechnungId: string | null;
  /**
   * income only — the Geldeingang date (income.geld_eingang_datum), ISO
   * YYYY-MM-DD or null. The Einnahmen detail form pre-fills its DateField from
   * this; without it the field rendered blank and the save action only wrote a
   * non-blank value, so the stopgap was a "bleibt erhalten, wenn leer" hint.
   */
  geldEingangDatum: string | null;
  /** donation only */
  spenderName: string | null;
  spenderEmail: string | null;
  spenderAdresse: string | null;
  bescheinigungNr: string | null;
  spendeKind: string | null;
  zweckbindungKind: "zweckfrei" | "zweckgebunden" | null;
  zweckbindungText: string | null;
  wertermittlungMethode: string | null;
  zustandBeschreibung: string | null;
  herkunftsbelegFileId: string | null;
  /**
   * donation only — Herkunftsbeleg (Sachspende provenance) mime/name, LEFT-
   * JOINed off `files` on `donations.herkunftsbeleg_file_id` (a SECOND files
   * join, distinct from the main Beleg one). Both null when no Herkunftsbeleg
   * is attached. The Spenden detail BelegViewer binds to these instead of the
   * old hardcoded `application/octet-stream` / "Herkunftsbeleg" placeholders.
   */
  herkunftsbelegMimeType: string | null;
  herkunftsbelegOriginalName: string | null;
  betriebsvermoegen: boolean | null;
  timeline: AuditTimelineEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTs(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// listZahlungsarten
// ---------------------------------------------------------------------------

export interface ZahlungsartOption {
  id: string;
  kind: string;
  label: string;
}

export async function listZahlungsarten(): Promise<ZahlungsartOption[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: zahlungsarten.id,
      kind: zahlungsarten.kind,
      label: zahlungsarten.label,
    })
    .from(zahlungsarten)
    .where(eq(zahlungsarten.deactivated, false))
    .orderBy(zahlungsarten.label);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as string,
    label: r.label,
  }));
}

// ---------------------------------------------------------------------------
// Per-tab paginated queries (Phase 2, Task 5) — real SQL LIMIT/OFFSET + COUNT.
//
// These REPLACE the merged-view `.slice()`-in-memory pagination above: each
// function pushes the page window AND the total COUNT into Postgres, so the
// query cost no longer scales with the full table size.
//
// Composition contract (Task-4 review): the `buildXWhere` builders return an
// `SQL[]` that can be EMPTY (e.g. ALL_YEARS + no active filters). We therefore
// compose `conds.length ? and(...conds) : undefined` and pass that straight to
// `.where(...)` — Drizzle treats `.where(undefined)` as "no filter" (all rows).
// NEVER `and(...conds)!` on a possibly-empty array (it would throw at runtime).
// The COUNT query reuses the SAME `where` so `total` matches the filtered set.
//
// Per-tab row projections carry each tab's display-specific fields so the
// Phase-3 Tier-C tab tracks render without ever editing this file.
// ---------------------------------------------------------------------------

export interface PageOptions {
  state: FilterState;
  year: YearScope;
  /**
   * Row limit for the page query. Pass `"all"` to skip `.limit()` and
   * `.offset()` entirely (full filtered+sorted set — used by CSV export).
   */
  limit: number | "all";
  offset: number;
  /**
   * Optional sort key (the scaffold's `?sort=` column key). Each `listXPage`
   * applies a per-tab ORDER-BY whitelist; an unknown/absent key falls back to
   * the default `gebuchtAm desc`. `dir` is `'asc' | 'desc'` (default `'desc'`).
   */
  sort?: string;
  dir?: "asc" | "desc";
}

/**
 * Resolve a sort key against a per-tab whitelist → a Drizzle ORDER-BY clause.
 * The whitelist maps the scaffold's column `key` (what `?sort=` carries) to the
 * concrete column. Unknown/absent keys (or an empty `sort`) fall back to
 * `gebuchtAm desc` so a tampered `?sort=` can never order by an unindexed /
 * non-existent column. `dir` defaults to `desc`.
 */
function resolveOrderBy(
  sort: string | undefined,
  dir: "asc" | "desc" | undefined,
  whitelist: Record<string, AnyColumn>,
  defaultColumn: AnyColumn,
): SQL {
  const column = sort ? whitelist[sort] : undefined;
  // Unknown/absent key → the default column, newest-first (gebuchtAm DESC),
  // ignoring `dir` so a tampered `?sort=` can't order by an unlisted column.
  if (!column) return desc(defaultColumn);
  return (dir === "asc" ? asc : desc)(column);
}

/** Shared base columns every per-tab row projection includes. */
export interface BaseTxRow {
  id: string;
  /**
   * Per-row discriminant. The Aurora list pages read it to negate expense
   * amounts (outflow minus sign) and label the kind pill — without it expenses
   * render as positive/green with a blank pill. Stamped as a per-table constant
   * by each `listXPage` map (no DB column; the table identity IS the kind).
   */
  kind: TransactionKind;
  businessId: string;
  bezeichnung: string;
  betragCents: number;
  currency: string;
  /** ISO timestamp string. */
  gebuchtAm: string;
  /**
   * The cash-relevant date (= relevanz_datum): abfluss_datum / geld_eingang_datum
   * / zugewendet_am as ISO YYYY-MM-DD, or null. Per-tab CSV exports emit
   * COALESCE(relevanzDatum, gebuchtAm) as the Datum so the booking date stays
   * inside the cash-year window the row was filtered into (migration 0034).
   */
  relevanzDatum: string | null;
  sphereSnapshot: string;
  kategorieNameSnapshot: string;
  yearOfBuchung: number | null;
  festgeschriebenAt: string | null;
}

// ── Ausgaben ────────────────────────────────────────────────────────────────

/** Ausgaben tab row: base + the Status / Bezahlt-von / Erstattung / Beleg fields. */
export interface AusgabenRow extends BaseTxRow {
  status: string;
  bezahltVonKind: string;
  bezahltVonDisplay: string;
  erstattetAm: string | null;
  /** Presence is what the Beleg column needs (the FK uuid, or null). */
  belegFileId: string | null;
  approvedAt: string | null;
  /**
   * Raw override value (null when no admin correction has been applied).
   * Exposed so callers can detect whether an override is present.
   */
  sphereOverride: string | null;
  /**
   * Effective sphere = sphereOverride ?? sphereSnapshot.
   * Mirrors the detail-helper derivation (transactions.ts ~272) so the CSV
   * export can emit the correct "Sphäre (Effektiv)" column for Ausgaben.
   */
  sphereEffective: string;
}

export async function listAusgabenPage(
  opts: PageOptions,
): Promise<{ rows: AusgabenRow[]; total: number }> {
  const db = getDb();
  const conds = buildAusgabenWhere(opts.state, opts.year);
  const where = conds.length ? and(...conds) : undefined;
  // ORDER-BY whitelist (spec §13 sortable headers): the scaffold's column keys.
  const orderBy = resolveOrderBy(
    opts.sort,
    opts.dir,
    {
      gebuchtAm: expenses.gebuchtAm,
      businessId: expenses.businessId,
      bezeichnung: expenses.bezeichnung,
      betrag: expenses.betragCents,
      status: expenses.status,
    },
    expenses.gebuchtAm,
  );
  const baseQuery = db
    .select({
      id: expenses.id,
      businessId: expenses.businessId,
      bezeichnung: expenses.bezeichnung,
      betragCents: expenses.betragCents,
      currency: expenses.currency,
      gebuchtAm: expenses.gebuchtAm,
      relevanzDatum: expenses.abflussDatum,
      sphereSnapshot: expenses.sphereSnapshot,
      sphereOverride: expenses.sphereOverride,
      kategorieNameSnapshot: expenses.kategorieNameSnapshot,
      yearOfBuchung: expenses.yearOfBuchung,
      festgeschriebenAt: expenses.festgeschriebenAt,
      status: expenses.status,
      bezahltVonKind: expenses.bezahltVonKind,
      bezahltVonDisplay: expenses.bezahltVonDisplay,
      erstattetAm: expenses.erstattetAm,
      belegFileId: expenses.belegFileId,
      approvedAt: expenses.approvedAt,
    })
    .from(expenses)
    .where(where)
    .orderBy(orderBy)
    .$dynamic();

  const rowQuery =
    opts.limit === "all"
      ? baseQuery
      : baseQuery.limit(opts.limit).offset(opts.offset);

  const [rows, countRows] = await Promise.all([
    rowQuery,
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(where),
  ]);
  const total = countRows[0]?.count ?? 0;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      kind: "expense" as const,
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      gebuchtAm: formatTs(r.gebuchtAm)!,
      relevanzDatum: r.relevanzDatum ?? null,
      sphereSnapshot: r.sphereSnapshot,
      sphereOverride: r.sphereOverride ?? null,
      sphereEffective: r.sphereOverride ?? r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      yearOfBuchung: r.yearOfBuchung ?? null,
      festgeschriebenAt: formatTs(r.festgeschriebenAt),
      status: r.status,
      bezahltVonKind: r.bezahltVonKind,
      bezahltVonDisplay: r.bezahltVonDisplay,
      erstattetAm: r.erstattetAm ?? null,
      belegFileId: r.belegFileId ?? null,
      approvedAt: formatTs(r.approvedAt),
    })),
    total,
  };
}

// ── Einnahmen ─────────────────────────────────────────────────────────────

/**
 * Einnahmen tab row: base + `rechnungBusinessId` — the 🔗 badge source. Income
 * has no invoice column, so it's projected via a LEFT JOIN LATERAL (P2-06): a
 * `… LIMIT 1` correlated subquery over `invoices.paid_by_income_id`, ordered by
 * a stable key (`invoices.created_at`). The LATERAL + LIMIT 1 makes no-invoice
 * rows yield NULL and multi-invoice rows deterministically take the first one,
 * with NO row fan-out (a plain LEFT JOIN would duplicate multi-invoice income
 * and break the LIMIT/OFFSET window + COUNT).
 */
export interface EinnahmenRow extends BaseTxRow {
  rechnungBusinessId: string | null;
}

export async function listEinnahmenPage(
  opts: PageOptions,
): Promise<{ rows: EinnahmenRow[]; total: number }> {
  const db = getDb();
  const conds = buildEinnahmenWhere(opts.state, opts.year);
  const where = conds.length ? and(...conds) : undefined;
  const orderBy = resolveOrderBy(
    opts.sort,
    opts.dir,
    {
      gebuchtAm: income.gebuchtAm,
      businessId: income.businessId,
      bezeichnung: income.bezeichnung,
      betrag: income.betragCents,
    },
    income.gebuchtAm,
  );

  // P2-06: correlated LATERAL subquery — references the outer `income.id`, so
  // it's LATERAL; `.orderBy(createdAt, id).limit(1)` picks one deterministically.
  // The PK is the secondary key so two invoices sharing a `created_at` still
  // resolve to a stable "first" (Postgres gives no tiebreak otherwise).
  const invLateral = db
    .select({ rechnungBusinessId: invoices.businessId })
    .from(invoices)
    .where(eq(invoices.paidByIncomeId, income.id))
    .orderBy(invoices.createdAt, invoices.id)
    .limit(1)
    .as("inv");

  const baseEinnahmenQuery = db
    .select({
      id: income.id,
      businessId: income.businessId,
      bezeichnung: income.bezeichnung,
      betragCents: income.betragCents,
      currency: income.currency,
      gebuchtAm: income.gebuchtAm,
      relevanzDatum: income.geldEingangDatum,
      sphereSnapshot: income.sphereSnapshot,
      kategorieNameSnapshot: income.kategorieNameSnapshot,
      yearOfBuchung: income.yearOfBuchung,
      festgeschriebenAt: income.festgeschriebenAt,
      rechnungBusinessId: invLateral.rechnungBusinessId,
    })
    .from(income)
    .leftJoinLateral(invLateral, sql`true`)
    .where(where)
    .orderBy(orderBy)
    .$dynamic();

  const rowEinnahmenQuery =
    opts.limit === "all"
      ? baseEinnahmenQuery
      : baseEinnahmenQuery.limit(opts.limit).offset(opts.offset);

  const [rows, countRows] = await Promise.all([
    rowEinnahmenQuery,
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(income)
      .where(where),
  ]);
  const total = countRows[0]?.count ?? 0;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      kind: "income" as const,
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      gebuchtAm: formatTs(r.gebuchtAm)!,
      relevanzDatum: r.relevanzDatum ?? null,
      sphereSnapshot: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      yearOfBuchung: r.yearOfBuchung ?? null,
      festgeschriebenAt: formatTs(r.festgeschriebenAt),
      rechnungBusinessId: r.rechnungBusinessId ?? null,
    })),
    total,
  };
}

// ── Spenden ─────────────────────────────────────────────────────────────────

/** Spenden tab row: base + Spender / Art / Zweckbindung / Bescheinigung fields. */
export interface SpendenRow extends BaseTxRow {
  spenderName: string | null;
  spendeKind: string;
  zweckbindungKind: string;
  bescheinigungNr: string | null;
}

export async function listSpendenPage(
  opts: PageOptions,
): Promise<{ rows: SpendenRow[]; total: number }> {
  const db = getDb();
  const conds = buildSpendenWhere(opts.state, opts.year);
  const where = conds.length ? and(...conds) : undefined;
  // Donations have no `bezeichnung` column (the list label is derived from
  // spenderName), so the sortable axes are Datum / ID / Spender / Betrag.
  const orderBy = resolveOrderBy(
    opts.sort,
    opts.dir,
    {
      gebuchtAm: donations.gebuchtAm,
      businessId: donations.businessId,
      betrag: donations.betragCents,
      spenderName: donations.spenderName,
    },
    donations.gebuchtAm,
  );
  const baseSpendenQuery = db
    .select({
      id: donations.id,
      businessId: donations.businessId,
      betragCents: donations.betragCents,
      currency: donations.currency,
      gebuchtAm: donations.gebuchtAm,
      relevanzDatum: donations.zugewendetAm,
      sphereSnapshot: donations.sphereSnapshot,
      kategorieNameSnapshot: donations.kategorieNameSnapshot,
      yearOfBuchung: donations.yearOfBuchung,
      festgeschriebenAt: donations.festgeschriebenAt,
      spenderName: donations.spenderName,
      spendeKind: donations.spendeKind,
      zweckbindungKind: donations.zweckbindungKind,
      bescheinigungNr: donations.bescheinigungNr,
    })
    .from(donations)
    .where(where)
    .orderBy(orderBy)
    .$dynamic();

  const rowSpendenQuery =
    opts.limit === "all"
      ? baseSpendenQuery
      : baseSpendenQuery.limit(opts.limit).offset(opts.offset);

  const [rows, countRows] = await Promise.all([
    rowSpendenQuery,
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(donations)
      .where(where),
  ]);
  const total = countRows[0]?.count ?? 0;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      kind: "donation" as const,
      businessId: r.businessId,
      // Spenden have no `bezeichnung` column — surface a human label like the
      // merged view does, falling back to the kategorie snapshot.
      bezeichnung: r.spenderName
        ? `Spende von ${r.spenderName}`
        : r.kategorieNameSnapshot,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      gebuchtAm: formatTs(r.gebuchtAm)!,
      relevanzDatum: r.relevanzDatum ?? null,
      sphereSnapshot: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      yearOfBuchung: r.yearOfBuchung ?? null,
      festgeschriebenAt: formatTs(r.festgeschriebenAt),
      spenderName: r.spenderName ?? null,
      spendeKind: r.spendeKind,
      zweckbindungKind: r.zweckbindungKind,
      bescheinigungNr: r.bescheinigungNr ?? null,
    })),
    total,
  };
}

// ---------------------------------------------------------------------------
// listTransaktionenFeedPage — Aurora unified feed (slice 5, spec §8).
//
// ONE SQL round-trip shape: UNION ALL of the three per-type projections,
// year-scoped via the existing WHERE builders, ordered by the CASH-relevant
// date (relevanz_datum = COALESCE(cash date, Berlin date of gebucht_am) —
// migration-0034 semantics, identical to what the GoBD/CSV exports emit), with
// real LIMIT/OFFSET + COUNT exactly like listAusgabenPage (the established
// pagination idiom — no new cursor mechanics for a Verein-sized dataset).
//
// `state.enums.typ` (parsed by the "transaktionen" registry tab) prunes whole
// UNION arms; the other FilterState fields flow into the per-type builders
// (search hits bezeichnung/bezahlt_von for expenses, bezeichnung for income,
// spender/kategorie for donations — the per-type search contract, unchanged).
//
// Also the replacement for the DELETED in-memory listTransactions(): the
// Jahresabschluss Buchungsliste + transactions.csv call it with limit: "all".
// NOTE one intentional semantic alignment: buildEinnahmenWhere always excludes
// superseded (Storno-chained) income rows — the feed and the Jahresabschluss
// surfaces now agree with the Einnahmen tab (pre-launch, no-compat).
// ---------------------------------------------------------------------------

export interface FeedRow {
  id: string;
  kind: TransactionKind;
  businessId: string;
  bezeichnung: string;
  betragCents: number;
  currency: string;
  /** ISO timestamp string. */
  gebuchtAm: string;
  /**
   * The cash-relevant date: COALESCE(abfluss/geld_eingang/zugewendet, Berlin
   * calendar date of gebucht_am). NEVER null — bare YYYY-MM-DD inside the
   * row's cash-year fiscal window (migration 0034).
   */
  relevanzDatum: string;
  sphereSnapshot: string;
  /** sphere_override ?? sphere_snapshot (expenses); snapshot otherwise. */
  sphereEffective: string;
  kategorieNameSnapshot: string;
  /** expense only; null for income/donations. */
  status: string | null;
  /**
   * expense only: no Beleg AND no Verzicht-Begründung. App-created rows can
   * never hit this (0032 CHECK enforces beleg-or-grund) — the flag guards
   * legacy/import paths so the "Beleg fehlt" chip stays truthful if rows
   * predating the constraint ever reappear.
   */
  belegFehlt: boolean;
  festgeschriebenAt: string | null;
  yearOfBuchung: number | null;
}

export interface FeedPageOptions {
  state: FilterState;
  year: YearScope;
  /** Row window; "all" skips LIMIT/OFFSET (Buchungsliste/CSV lane). */
  limit: number | "all";
  offset: number;
  /**
   * Sort lens (spec §4.1, the one real feed delta). `datum` (default) keeps the
   * chronological cash-date order the month-group feed lives on; `betrag`
   * ranks the whole result set by ABS(betrag_cents) DESC (the "was waren die
   * Brocken?" lens). Anything else (or absent) resolves to `datum` — the route
   * whitelists the URL param, this is the belt-and-braces default.
   */
  sort?: "datum" | "betrag";
}

export interface FeedPage {
  rows: FeedRow[];
  /** Count of the whole (paginated) match set. */
  total: number;
  /**
   * Signed net cents (ADR-0003) over the WHOLE match set — expenses negative,
   * income/donations positive. Its own aggregate (NOT a per-page sum), so the
   * Betrag-lens "Netto gesamt" foot and the Datum-lens grand total both read the
   * whole filtered set regardless of pagination.
   */
  sumCents: number;
  /** Distinct Berlin calendar months (YYYY-MM of relevanz_datum) in the set. */
  monthCount: number;
}

interface RawFeedRow extends Record<string, unknown> {
  id: string;
  kind: TransactionKind;
  business_id: string;
  bezeichnung: string;
  betrag_cents: string | number;
  currency: string;
  gebucht_am: Date | string;
  relevanz_datum: string;
  sphere_snapshot: string;
  sphere_effective: string;
  kategorie_name_snapshot: string;
  status: string | null;
  beleg_fehlt: boolean;
  festgeschrieben_at: Date | string | null;
  year_of_buchung: number | null;
}

const FEED_TYP_TO_KIND: Record<string, TransactionKind> = {
  ausgaben: "expense",
  einnahmen: "income",
  spenden: "donation",
};

export async function listTransaktionenFeedPage(
  opts: FeedPageOptions,
): Promise<FeedPage> {
  const db = getDb();
  const typVals = opts.state.enums["typ"] ?? [];
  const wanted = new Set<TransactionKind>(
    typVals.length
      ? typVals.flatMap((t) =>
          FEED_TYP_TO_KIND[t] ? [FEED_TYP_TO_KIND[t]!] : [],
        )
      : (["expense", "income", "donation"] as TransactionKind[]),
  );

  const arms: SQL[] = [];

  if (wanted.has("expense")) {
    const conds = buildAusgabenWhere(opts.state, opts.year);
    const where = conds.length ? and(...conds)! : sql`TRUE`;
    arms.push(sql`
      SELECT ${expenses.id} AS id,
             'expense'::text AS kind,
             ${expenses.businessId} AS business_id,
             ${expenses.bezeichnung} AS bezeichnung,
             ${expenses.betragCents} AS betrag_cents,
             ${expenses.currency} AS currency,
             ${expenses.gebuchtAm} AS gebucht_am,
             COALESCE(${expenses.abflussDatum}::text, (${expenses.gebuchtAm} AT TIME ZONE 'Europe/Berlin')::date::text) AS relevanz_datum,
             ${expenses.sphereSnapshot}::text AS sphere_snapshot,
             COALESCE(${expenses.sphereOverride}, ${expenses.sphereSnapshot})::text AS sphere_effective,
             ${expenses.kategorieNameSnapshot} AS kategorie_name_snapshot,
             ${expenses.status}::text AS status,
             (${expenses.belegFileId} IS NULL AND ${expenses.belegVerzichtGrund} IS NULL) AS beleg_fehlt,
             ${expenses.festgeschriebenAt} AS festgeschrieben_at,
             ${expenses.yearOfBuchung} AS year_of_buchung
      FROM ${expenses}
      WHERE ${where}`);
  }

  if (wanted.has("income")) {
    const conds = buildEinnahmenWhere(opts.state, opts.year);
    const where = conds.length ? and(...conds)! : sql`TRUE`;
    arms.push(sql`
      SELECT ${income.id} AS id,
             'income'::text AS kind,
             ${income.businessId} AS business_id,
             ${income.bezeichnung} AS bezeichnung,
             ${income.betragCents} AS betrag_cents,
             ${income.currency} AS currency,
             ${income.gebuchtAm} AS gebucht_am,
             COALESCE(${income.geldEingangDatum}::text, (${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin')::date::text) AS relevanz_datum,
             ${income.sphereSnapshot}::text AS sphere_snapshot,
             ${income.sphereSnapshot}::text AS sphere_effective,
             ${income.kategorieNameSnapshot} AS kategorie_name_snapshot,
             NULL::text AS status,
             FALSE AS beleg_fehlt,
             ${income.festgeschriebenAt} AS festgeschrieben_at,
             ${income.yearOfBuchung} AS year_of_buchung
      FROM ${income}
      WHERE ${where}`);
  }

  if (wanted.has("donation")) {
    const conds = buildSpendenWhere(opts.state, opts.year);
    const where = conds.length ? and(...conds)! : sql`TRUE`;
    arms.push(sql`
      SELECT ${donations.id} AS id,
             'donation'::text AS kind,
             ${donations.businessId} AS business_id,
             COALESCE('Spende von ' || ${donations.spenderName}, ${donations.kategorieNameSnapshot}) AS bezeichnung,
             ${donations.betragCents} AS betrag_cents,
             ${donations.currency} AS currency,
             ${donations.gebuchtAm} AS gebucht_am,
             COALESCE(${donations.zugewendetAm}::text, (${donations.gebuchtAm} AT TIME ZONE 'Europe/Berlin')::date::text) AS relevanz_datum,
             ${donations.sphereSnapshot}::text AS sphere_snapshot,
             ${donations.sphereSnapshot}::text AS sphere_effective,
             ${donations.kategorieNameSnapshot} AS kategorie_name_snapshot,
             NULL::text AS status,
             FALSE AS beleg_fehlt,
             ${donations.festgeschriebenAt} AS festgeschrieben_at,
             ${donations.yearOfBuchung} AS year_of_buchung
      FROM ${donations}
      WHERE ${where}`);
  }

  if (arms.length === 0)
    return { rows: [], total: 0, sumCents: 0, monthCount: 0 };

  const unionSql = sql.join(arms, sql` UNION ALL `);
  const pageSql =
    opts.limit === "all"
      ? sql``
      : sql` LIMIT ${opts.limit} OFFSET ${opts.offset}`;

  // Betrag-lens = ABS(betrag_cents) DESC over the UNION (the "was waren die
  // Brocken?" ranking); Datum-lens (default) = the chronological cash-date
  // order the month groups live on. Both carry the same deterministic tiebreak
  // (relevanz_datum, gebucht_am, id) so pagination is stable.
  const orderSql =
    opts.sort === "betrag"
      ? sql`ORDER BY ABS(betrag_cents) DESC, relevanz_datum DESC, gebucht_am DESC, id DESC`
      : sql`ORDER BY relevanz_datum DESC, gebucht_am DESC, id DESC`;

  const [raw, aggRows] = await Promise.all([
    db.execute<RawFeedRow>(
      sql`SELECT * FROM (${unionSql}) AS feed ${orderSql}${pageSql}`,
    ),
    // ONE aggregate pass over the WHOLE filtered set: count, signed net
    // (expense negative), and distinct Berlin months (YYYY-MM of the text
    // relevanz_datum) for the feed foot. Independent of LIMIT/OFFSET.
    db.execute<{
      total: number;
      sum_cents: string | number;
      month_count: number;
    }>(
      sql`SELECT count(*)::int AS total,
                 COALESCE(SUM(CASE WHEN kind = 'expense' THEN -betrag_cents ELSE betrag_cents END), 0)::bigint AS sum_cents,
                 COUNT(DISTINCT substr(relevanz_datum, 1, 7))::int AS month_count
            FROM (${unionSql}) AS feed`,
    ),
  ]);

  const agg = aggRows[0];
  const total = Number(agg?.total ?? 0);
  const sumCents = Number(agg?.sum_cents ?? 0);
  const monthCount = Number(agg?.month_count ?? 0);
  return {
    rows: [...raw].map((r) => ({
      id: r.id,
      kind: r.kind,
      businessId: r.business_id,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betrag_cents),
      currency: r.currency,
      gebuchtAm: formatTs(r.gebucht_am)!,
      relevanzDatum: r.relevanz_datum,
      sphereSnapshot: r.sphere_snapshot,
      sphereEffective: r.sphere_effective,
      kategorieNameSnapshot: r.kategorie_name_snapshot,
      status: r.status ?? null,
      belegFehlt: r.beleg_fehlt === true,
      festgeschriebenAt: formatTs(r.festgeschrieben_at),
      yearOfBuchung: r.year_of_buchung ?? null,
    })),
    total,
    sumCents,
    monthCount,
  };
}

export interface FeedKindCounts {
  expense: number;
  income: number;
  donation: number;
  total: number;
}

/**
 * Per-kind counts for the feed's filter chips ("Alle 8 · Einnahmen 7 · …").
 * Runs ALL three UNION arms — the `typ` chip filter is deliberately IGNORED so
 * each chip shows its full count in the current year + search scope (a chip's
 * badge must not collapse to the active filter). One grouped round-trip.
 */
export async function countTransaktionenFeedByKind(opts: {
  state: FilterState;
  year: YearScope;
}): Promise<FeedKindCounts> {
  const db = getDb();
  const whereOf = (conds: SQL[]): SQL =>
    conds.length ? and(...conds)! : sql`TRUE`;
  const arms: SQL[] = [
    sql`SELECT 'expense'::text AS kind FROM ${expenses} WHERE ${whereOf(buildAusgabenWhere(opts.state, opts.year))}`,
    sql`SELECT 'income'::text AS kind FROM ${income} WHERE ${whereOf(buildEinnahmenWhere(opts.state, opts.year))}`,
    sql`SELECT 'donation'::text AS kind FROM ${donations} WHERE ${whereOf(buildSpendenWhere(opts.state, opts.year))}`,
  ];
  const rows = await db.execute<{ kind: string; n: number }>(
    sql`SELECT kind, count(*)::int AS n FROM (${sql.join(arms, sql` UNION ALL `)}) AS feed GROUP BY kind`,
  );
  const counts: FeedKindCounts = {
    expense: 0,
    income: 0,
    donation: 0,
    total: 0,
  };
  for (const r of rows) {
    const n = Number(r.n);
    if (r.kind === "expense") counts.expense = n;
    else if (r.kind === "income") counts.income = n;
    else if (r.kind === "donation") counts.donation = n;
    counts.total += n;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// getTransactionDetail
// ---------------------------------------------------------------------------

export async function getTransactionDetail(
  id: string,
  kind: TransactionKind,
): Promise<TransactionDetail | null> {
  // F14: a non-UUID id (bad bookmark/typo) would hit the uuid column as 22P02
  // → unhandled 500. Treat it as "not found" so the loaders' existing null →
  // error(404) branch fires instead.
  if (!isUuid(id)) return null;

  const db = getDb();

  let base: TransactionDetail | undefined;

  if (kind === "expense") {
    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    base = {
      id: r.id,
      kind: "expense",
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      gebuchtAm: r.gebuchtAm.toISOString(),
      relevanzDatum: r.abflussDatum ?? null,
      rechnungsdatum: r.rechnungsdatum ?? null,
      sphereSnapshot: r.sphereSnapshot,
      sphereEffective: r.sphereOverride ?? r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      kategorieId: r.kategorieId ?? null,
      status: r.status,
      erstattetAm: r.erstattetAm ?? null,
      bezahltVonDisplay: r.bezahltVonDisplay,
      festgeschriebenAt: r.festgeschriebenAt?.toISOString() ?? null,
      yearOfBuchung: r.yearOfBuchung ?? null,
      kommentar: r.kommentar ?? null,
      projectId: r.projectId ?? null,
      zahlungsartId: r.zahlungsartId ?? null,
      externIban: r.externIban ?? null,
      externEmail: r.externEmail ?? null,
      externName: r.externName ?? null,
      bezahltVonMemberId: r.bezahltVonMemberId ?? null,
      belegDriveFileId: r.belegDriveFileId ?? null,
      belegFileId: r.belegFileId ?? null,
      // Feed-consistent „Beleg fehlt" flag (M8/minor-9): no Beleg AND no
      // begründeter Verzicht — mirrors the list query's `beleg_fehlt`.
      belegFehlt: r.belegFileId == null && r.belegVerzichtGrund == null,
      bescheinigungDatum: null,
      // belegMimeType/belegOriginalName are filled from the shared `files`
      // lookup below (sourced from files.mime_type / files.original_filename).
      belegMimeType: null,
      belegOriginalName: null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      rechnungBusinessId: null,
      rechnungId: null,
      geldEingangDatum: null,
      spenderName: null,
      spenderEmail: null,
      spenderAdresse: null,
      bescheinigungNr: null,
      spendeKind: null,
      zweckbindungKind: null,
      zweckbindungText: null,
      wertermittlungMethode: null,
      zustandBeschreibung: null,
      herkunftsbelegFileId: null,
      herkunftsbelegMimeType: null,
      herkunftsbelegOriginalName: null,
      betriebsvermoegen: null,
      timeline: [],
    };
  } else if (kind === "income") {
    const rows = await db
      .select()
      .from(income)
      .where(eq(income.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    // aus-Rechnung link: the linked Ausgangsrechnung's business_id via the same
    // correlated source as the Phase-2 Einnahmen list (invoices.paid_by_income_id
    // = income.id). `.orderBy(createdAt, id).limit(1)` resolves deterministically
    // if multiple invoices ever point at one income row. NULL when unlinked.
    const invRows = await db
      .select({
        rechnungId: invoices.id,
        rechnungBusinessId: invoices.businessId,
      })
      .from(invoices)
      .where(eq(invoices.paidByIncomeId, r.id))
      .orderBy(invoices.createdAt, invoices.id)
      .limit(1);
    base = {
      id: r.id,
      kind: "income",
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      gebuchtAm: r.gebuchtAm.toISOString(),
      relevanzDatum: r.geldEingangDatum ?? null,
      rechnungsdatum: r.rechnungsdatum ?? null,
      sphereSnapshot: r.sphereSnapshot,
      sphereEffective: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      kategorieId: r.kategorieId ?? null,
      status: null,
      erstattetAm: null,
      bezahltVonDisplay: null,
      festgeschriebenAt: r.festgeschriebenAt?.toISOString() ?? null,
      yearOfBuchung: r.yearOfBuchung ?? null,
      kommentar: r.kommentar ?? null,
      projectId: r.projectId ?? null,
      zahlungsartId: r.zahlungsartId ?? null,
      externIban: null,
      externEmail: null,
      externName: null,
      bezahltVonMemberId: null,
      belegDriveFileId: r.belegDriveFileId ?? null,
      belegFileId: r.belegFileId ?? null,
      belegMimeType: null,
      belegOriginalName: null,
      belegFehlt: false,
      bescheinigungDatum: null,
      approvedAt: null,
      rechnungBusinessId: invRows[0]?.rechnungBusinessId ?? null,
      rechnungId: invRows[0]?.rechnungId ?? null,
      geldEingangDatum: r.geldEingangDatum ?? null,
      spenderName: null,
      spenderEmail: null,
      spenderAdresse: null,
      bescheinigungNr: null,
      spendeKind: null,
      zweckbindungKind: null,
      zweckbindungText: null,
      wertermittlungMethode: null,
      zustandBeschreibung: null,
      herkunftsbelegFileId: null,
      herkunftsbelegMimeType: null,
      herkunftsbelegOriginalName: null,
      betriebsvermoegen: null,
      timeline: [],
    };
  } else {
    const rows = await db
      .select()
      .from(donations)
      .where(eq(donations.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    base = {
      id: r.id,
      kind: "donation",
      businessId: r.businessId,
      bezeichnung: r.spenderName
        ? `Spende von ${r.spenderName}`
        : r.kategorieNameSnapshot,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      gebuchtAm: r.gebuchtAm.toISOString(),
      relevanzDatum: r.zugewendetAm ?? null,
      rechnungsdatum: null,
      sphereSnapshot: r.sphereSnapshot,
      sphereEffective: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      kategorieId: r.kategorieId ?? null,
      status: null,
      erstattetAm: null,
      bezahltVonDisplay: r.spenderName ?? null,
      festgeschriebenAt: r.festgeschriebenAt?.toISOString() ?? null,
      yearOfBuchung: r.yearOfBuchung ?? null,
      kommentar: null,
      projectId: r.projectId ?? null,
      zahlungsartId: null,
      externIban: null,
      externEmail: r.spenderEmail ?? null,
      externName: r.spenderName ?? null,
      bezahltVonMemberId: r.memberId ?? null,
      // donations have no legacy Drive Beleg column (newer Spenden model).
      belegDriveFileId: null,
      belegFileId: r.belegFileId ?? null,
      belegMimeType: null,
      belegOriginalName: null,
      belegFehlt: false,
      bescheinigungDatum: r.bescheinigungAusgestelltAm ?? null,
      approvedAt: null,
      rechnungBusinessId: null,
      rechnungId: null,
      geldEingangDatum: null,
      spenderName: r.spenderName ?? null,
      spenderEmail: r.spenderEmail ?? null,
      spenderAdresse: r.spenderAdresse ?? null,
      bescheinigungNr: r.bescheinigungNr ?? null,
      spendeKind: r.spendeKind,
      zweckbindungKind: r.zweckbindungKind,
      zweckbindungText: r.zweckbindungText ?? null,
      wertermittlungMethode: r.wertermittlungMethode ?? null,
      zustandBeschreibung: r.zustandBeschreibung ?? null,
      herkunftsbelegFileId: r.herkunftsbelegFileId ?? null,
      // Filled from the SECOND files lookup below (Herkunftsbeleg provenance).
      herkunftsbelegMimeType: null,
      herkunftsbelegOriginalName: null,
      betriebsvermoegen: r.betriebsvermoegen ?? null,
      timeline: [],
    };
  }

  if (!base) return null;

  // Beleg metadata (all kinds): resolve mime_type / original_filename off the
  // normalized `files` row when a Beleg FK is present. NOT the legacy
  // beleg_drive_file_id / beleg_original_name text columns — the §11 viewer +
  // Phases 5/6 read belegFileId/belegMimeType/belegOriginalName off `detail`.
  if (base.belegFileId) {
    const fileRows = await db
      .select({
        mimeType: files.mimeType,
        originalFilename: files.originalFilename,
      })
      .from(files)
      .where(eq(files.id, base.belegFileId))
      .limit(1);
    const f = fileRows[0];
    if (f) {
      base.belegMimeType = f.mimeType;
      base.belegOriginalName = f.originalFilename;
    }
  }

  // Herkunftsbeleg metadata (donations only): a SECOND `files` lookup off
  // `donations.herkunftsbeleg_file_id` (the Sachspende provenance receipt),
  // distinct from the main Beleg join above. Resolves mime_type /
  // original_filename so the Spenden detail BelegViewer renders the real type
  // + name instead of the hardcoded application/octet-stream placeholder.
  if (base.herkunftsbelegFileId) {
    const herkunftRows = await db
      .select({
        mimeType: files.mimeType,
        originalFilename: files.originalFilename,
      })
      .from(files)
      .where(eq(files.id, base.herkunftsbelegFileId))
      .limit(1);
    const hf = herkunftRows[0];
    if (hf) {
      base.herkunftsbelegMimeType = hf.mimeType;
      base.herkunftsbelegOriginalName = hf.originalFilename;
    }
  }

  // Load audit_log timeline (reverse chrono)
  const entityKind =
    kind === "expense" ? "expense" : kind === "income" ? "income" : "donation";

  const timelineRows = await db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      action: auditLog.action,
      actorKind: auditLog.actorKind,
      actorUserId: auditLog.actorUserId,
      payload: auditLog.payload,
    })
    .from(auditLog)
    .where(
      and(
        eq(
          auditLog.entityKind,
          entityKind as "expense" | "income" | "donation",
        ),
        eq(auditLog.entityId, id),
      ),
    )
    .orderBy(desc(auditLog.occurredAt))
    .limit(50);

  const result: TransactionDetail = {
    ...base,
    timeline: timelineRows.map((t) => ({
      id: t.id,
      occurredAt: t.occurredAt.toISOString(),
      action: t.action,
      actorKind: t.actorKind,
      actorUserId: t.actorUserId ?? null,
      payload: (t.payload as Record<string, unknown> | null) ?? null,
    })),
  };

  return result;
}

// ---------------------------------------------------------------------------
// listApprovedPendingErstattet — for SEPA XML generator
// ---------------------------------------------------------------------------

export interface ApprovedExpense {
  id: string;
  businessId: string;
  bezeichnung: string;
  betragCents: number;
  bezahltVonDisplay: string;
  bezahltVonKind: string;
  externIban: string | null;
  externName: string | null;
  /** Member IBAN: must be looked up separately — stored on member row */
  bezahltVonMemberId: string | null;
  memberIban: string | null;
}

export async function listApprovedPendingErstattet(): Promise<
  ApprovedExpense[]
> {
  const db = getDb();

  const rows = await db
    .select({
      id: expenses.id,
      businessId: expenses.businessId,
      bezeichnung: expenses.bezeichnung,
      betragCents: expenses.betragCents,
      bezahltVonDisplay: expenses.bezahltVonDisplay,
      bezahltVonKind: expenses.bezahltVonKind,
      externIban: expenses.externIban,
      externName: expenses.externName,
      bezahltVonMemberId: expenses.bezahltVonMemberId,
      memberIban: members.iban,
    })
    .from(expenses)
    .leftJoin(members, eq(members.id, expenses.bezahltVonMemberId))
    .where(
      and(
        sql`${expenses.approvedAt} IS NOT NULL`,
        sql`${expenses.erstattetAm} IS NULL`,
        sql`${expenses.festgeschriebenAt} IS NULL`,
      ),
    )
    .orderBy(expenses.businessId);

  return rows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    bezeichnung: r.bezeichnung,
    betragCents: Number(r.betragCents),
    bezahltVonDisplay: r.bezahltVonDisplay,
    bezahltVonKind: r.bezahltVonKind as string,
    externIban: r.externIban ?? null,
    externName: r.externName ?? null,
    bezahltVonMemberId: r.bezahltVonMemberId ?? null,
    memberIban: r.memberIban ?? null,
  }));
}

// ---------------------------------------------------------------------------
// createExpense / createIncome / createDonation — direct entry (neu page)
// ---------------------------------------------------------------------------

export interface CreateExpenseInput {
  bezeichnung: string;
  betragCents: number;
  currency?: string;
  rechnungsdatum?: string | null;
  /**
   * C2-TAX (cycle 2): Abfluss-Datum — required for kind=ausgabe per EÜR §11
   * EStG. Maps to the existing `expenses.abfluss_datum` column (no new
   * column added; the migration 0018 that introduced a parallel
   * `geldfluss_datum` was reverted after julia-buchhaltung's review).
   * Zod + UI on the admin direct path enforce this for new app-mode entries.
   */
  abflussDatum?: string | null;
  kommentar?: string | null;
  // #115: the chosen Kategorie is now identified BY ID (authoritative). The
  // name/sphere snapshots are DERIVED server-side from the resolved row —
  // never trusted from the caller. resolveKategorieByName stays for donation
  // derivation / invoice mark-paid fallback / importer, not this write path.
  kategorieId: string;
  bezahltVonKind: "verein" | "member" | "extern";
  bezahltVonMemberId?: string | null;
  bezahltVonDisplay: string;
  externName?: string | null;
  externIban?: string | null;
  externEmail?: string | null;
  projectId?: string | null;
  /** C2-TAX: FK into the normalized `files` table for the attached Beleg. */
  belegFileId?: string | null;
  // P1 (spec §4.1): "Kein Beleg vorhanden → Begründung". An expense satisfies
  // expenses_beleg_or_grund_ck by EITHER a belegFileId OR a Verzicht-Begründung.
  // Persist this so Phase 4's Ausgaben form can save the no-Beleg case.
  belegVerzichtGrund?: string | null;
  actorUserId: string;
  businessId: string;
}

export interface CreateIncomeInput {
  bezeichnung: string;
  betragCents: number;
  currency?: string;
  geldEingangDatum?: string | null;
  rechnungsdatum?: string | null;
  kommentar?: string | null;
  // #115: the chosen Kategorie is now identified BY ID (authoritative). The
  // name/sphere snapshots are DERIVED server-side from the resolved row —
  // never trusted from the caller. resolveKategorieByName stays for donation
  // derivation / invoice mark-paid fallback / importer, not this write path.
  kategorieId: string;
  projectId?: string | null;
  // P1-T7 (spec §4.6): the `income.beleg_file_id` column already existed but
  // createIncome dropped it — persist it so "Beleg optional" on the Einnahmen
  // form (Phase 5) can actually save the attached Beleg.
  belegFileId?: string | null;
  actorUserId: string;
  businessId: string;
}

export interface CreateDonationInput {
  betragCents: number;
  currency?: string;
  zugewendetAm?: string | null;
  // NOTE: kategorieId/kategorieNameSnapshot/sphereSnapshot are now DERIVED
  // server-side from (spendeKind, zweckbindungKind) — these legacy fields are
  // accepted-but-ignored so existing callers don't break (spec §4.3-4.5).
  kategorieId?: string | null;
  kategorieNameSnapshot?: string;
  sphereSnapshot?: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
  memberId?: string | null;
  spenderName?: string | null;
  spenderEmail?: string | null;
  spenderAdresse?: string | null;
  spendeKind?: "geldspende" | "sachspende" | "aufwandsspende";
  zweckbindungKind?: "zweckfrei" | "zweckgebunden";
  zweckbindungText?: string | null;
  // SPEC-02 Sachspende Wertermittlung (all optional, persisted as-passed).
  wertermittlungMethode?:
    | "marktpreis"
    | "kaufbeleg"
    | "schaetzung"
    | "buchwert"
    | null;
  zustandBeschreibung?: string | null;
  herkunftsbelegFileId?: string | null;
  belegFileId?: string | null;
  betriebsvermoegen?: boolean;
  projectId?: string | null;
  actorUserId: string;
  businessId: string;
}

export async function createExpense(
  input: CreateExpenseInput,
): Promise<{ id: string; businessId: string }> {
  const db = getDb();
  // #115 (spec §4.5): resolve the Kategorie BY ID (authoritative) and derive
  // both the name-snapshot AND the sphere STRICTLY from the resolved row (no
  // project override, no caller-supplied name/sphere). resolveKategorieById
  // throws on a miss / kind-mismatch so a stale or cross-kind id can't book.
  const kat = await resolveKategorieById("expense", input.kategorieId);
  const [row] = await db
    .insert(expenses)
    .values({
      businessId: input.businessId,
      source: "app",
      bezeichnung: input.bezeichnung,
      betragCents: BigInt(input.betragCents),
      currency: input.currency ?? "EUR",
      rechnungsdatum: input.rechnungsdatum ?? null,
      // C2-TAX: persist the cash-out date per EÜR §11 EStG.
      abflussDatum: input.abflussDatum ?? null,
      kommentar: input.kommentar ?? null,
      kategorieId: kat.id,
      kategorieNameSnapshot: kat.name,
      sphereSnapshot: kat.sphere,
      bezahltVonKind: input.bezahltVonKind,
      bezahltVonMemberId: input.bezahltVonMemberId ?? null,
      bezahltVonDisplay: input.bezahltVonDisplay,
      externName: input.externName ?? null,
      externIban: input.externIban ?? null,
      externEmail: input.externEmail ?? null,
      projectId: input.projectId ?? null,
      // C2-TAX: FK into the normalized `files` table for the attached Beleg.
      belegFileId: input.belegFileId ?? null,
      // P1 (spec §4.1): persist the Verzicht-Begründung so the kein-Beleg case
      // satisfies expenses_beleg_or_grund_ck without an attached file.
      belegVerzichtGrund: input.belegVerzichtGrund ?? null,
      status: "geprueft",
      approvedAt: new Date(),
      approvedByUserId: input.actorUserId,
      createdByUserId: input.actorUserId,
    })
    .returning({ id: expenses.id, businessId: expenses.businessId });
  if (!row) throw new Error("INSERT expense returned no row");
  await bus.emit("expense.created", {
    id: row.id,
    businessId: row.businessId,
    actorUserId: input.actorUserId,
    payload: {
      bezeichnung: input.bezeichnung,
      betragCents: input.betragCents,
      source: "direct_entry",
    },
  });
  return row;
}

export async function createIncome(
  input: CreateIncomeInput,
): Promise<{ id: string; businessId: string }> {
  const db = getDb();
  // #115 (spec §4.5): resolve the Kategorie BY ID (authoritative) and derive
  // both the name-snapshot AND the sphere STRICTLY from the resolved row (no
  // project override, no caller-supplied name/sphere). resolveKategorieById
  // throws on a miss / kind-mismatch so a stale or cross-kind id can't book.
  const kat = await resolveKategorieById("income", input.kategorieId);
  const [row] = await db
    .insert(income)
    .values({
      businessId: input.businessId,
      source: "app",
      bezeichnung: input.bezeichnung,
      betragCents: BigInt(input.betragCents),
      currency: input.currency ?? "EUR",
      geldEingangDatum: input.geldEingangDatum ?? null,
      rechnungsdatum: input.rechnungsdatum ?? null,
      kommentar: input.kommentar ?? null,
      kategorieId: kat.id,
      kategorieNameSnapshot: kat.name,
      sphereSnapshot: kat.sphere,
      projectId: input.projectId ?? null,
      // P1-T7 (spec §4.6): persist the Beleg FK — the column existed but the
      // fn previously dropped it (Phase 5 "Beleg optional" depends on this).
      belegFileId: input.belegFileId ?? null,
      createdByUserId: input.actorUserId,
    })
    .returning({ id: income.id, businessId: income.businessId });
  if (!row) throw new Error("INSERT income returned no row");
  await bus.emit("income.created", {
    id: row.id,
    businessId: row.businessId,
    actorUserId: input.actorUserId,
    payload: {
      bezeichnung: input.bezeichnung,
      betragCents: input.betragCents,
      source: "direct_entry",
    },
  });
  return row;
}

/**
 * Resolve a seeded Kategorie by (kind, name) → { id, sphere, name }.
 * Throws if not found — donation derivation relies on the seed having
 * installed the income kategorien (spec §4.3/§4.4).
 */
export async function resolveKategorieByName(
  kind: "expense" | "income",
  name: string,
): Promise<{ id: string; sphere: Sphere; name: string }> {
  const db = getDb();
  const [row] = await db
    .select({
      id: kategorien.id,
      sphere: kategorien.sphere,
      name: kategorien.name,
    })
    .from(kategorien)
    .where(and(eq(kategorien.kind, kind), eq(kategorien.name, name)))
    .limit(1);
  if (!row) throw new Error(`Kategorie not found: ${kind}/${name}`);
  return row;
}

/**
 * #115: resolve a Kategorie by (kind, id) → { id, sphere, name }. This is the
 * authoritative resolver for the transaction ENTRY write path (createExpense/
 * createIncome + the edit + inbox-approve routes) now that the picker submits
 * an id. The `kind` guard rejects a cross-kind id (an income id on an expense),
 * mirroring resolveKategorieByName. Throws on a miss so a stale/tampered id
 * surfaces as a 4xx instead of silently booking "(Unkategorisiert)".
 * resolveKategorieByName stays for name-keyed paths (donation derivation,
 * invoice mark-paid fallback, importer).
 */
export async function resolveKategorieById(
  kind: "expense" | "income",
  id: string,
): Promise<{ id: string; sphere: Sphere; name: string }> {
  const db = getDb();
  const [row] = await db
    .select({
      id: kategorien.id,
      sphere: kategorien.sphere,
      name: kategorien.name,
    })
    .from(kategorien)
    .where(and(eq(kategorien.kind, kind), eq(kategorien.id, id)))
    .limit(1);
  if (!row) throw new Error(`Kategorie not found: ${kind}/${id}`);
  return row;
}

export async function createDonation(
  input: CreateDonationInput,
): Promise<{ id: string; businessId: string }> {
  const db = getDb();
  // §4.3-4.5: kategorie + sphere are DERIVED server-side from the donation
  // shape — never trusted from the caller. Sphere is always "ideeller".
  const kategorieName = deriveDonationKategorieName(
    input.spendeKind ?? "geldspende",
    input.zweckbindungKind ?? "zweckfrei",
  );
  const kat = await resolveKategorieByName("income", kategorieName);
  const [row] = await db
    .insert(donations)
    .values({
      businessId: input.businessId,
      source: "app",
      betragCents: BigInt(input.betragCents),
      currency: input.currency ?? "EUR",
      zugewendetAm: input.zugewendetAm ?? null,
      kategorieId: kat.id,
      kategorieNameSnapshot: kat.name,
      sphereSnapshot: "ideeller",
      memberId: input.memberId ?? null,
      spenderName: input.spenderName ?? null,
      spenderEmail: input.spenderEmail ?? null,
      spenderAdresse: input.spenderAdresse ?? null,
      spendeKind: input.spendeKind ?? "geldspende",
      zweckbindungKind: input.zweckbindungKind ?? "zweckfrei",
      zweckbindungText: input.zweckbindungText ?? null,
      // SPEC-02 Sachspende Wertermittlung — persist as passed so the
      // Task-10 donations_sachspende_wertermittlung_ck CHECK will be satisfied.
      wertermittlungMethode: input.wertermittlungMethode ?? null,
      zustandBeschreibung: input.zustandBeschreibung ?? null,
      herkunftsbelegFileId: input.herkunftsbelegFileId ?? null,
      belegFileId: input.belegFileId ?? null,
      betriebsvermoegen: input.betriebsvermoegen ?? false,
      projectId: input.projectId ?? null,
      createdByUserId: input.actorUserId,
    })
    .returning({ id: donations.id, businessId: donations.businessId });
  if (!row) throw new Error("INSERT donation returned no row");
  await bus.emit("donation.created", {
    id: row.id,
    businessId: row.businessId,
    actorUserId: input.actorUserId,
    payload: {
      betragCents: input.betragCents,
      spendeKind: input.spendeKind ?? "geldspende",
      source: "direct_entry",
    },
  });
  return row;
}

// ---------------------------------------------------------------------------
// updateExpense — pre-Festschreibung edit
// ---------------------------------------------------------------------------

export interface UpdateExpenseInput {
  bezeichnung?: string;
  betragCents?: number;
  rechnungsdatum?: string | null;
  kommentar?: string | null;
  kategorieId?: string | null;
  kategorieNameSnapshot?: string;
  sphereSnapshot?: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
  sphereOverride?:
    | "ideeller"
    | "vermoegen"
    | "zweckbetrieb"
    | "wirtschaftlich"
    | null;
  projectId?: string | null;
  zahlungsartId?: string | null;
  erstattetAm?: string | null;
}

// ---------------------------------------------------------------------------
// markExpenseAsPaid — single source of truth for the quick "Bezahlt markieren"
// shortcut (TransactionRow kebab) and any other "just set the dates" entrypoint
// that doesn't need to fire the ErstattungsMail.
//
// Differs from `markExpenseErstattet` (audit-inbox-actions.ts) in three ways:
//   1. `zahlartId` is optional — the kebab quick-action skips Zahlungsart
//      selection. The "Speichern und benachrichtigen" path on the detail
//      page still uses `markExpenseErstattet` because it requires Zahlungsart
//      to fire the dedup'd ErstattungsMail.
//   2. Festschreibung check is row-level (`expenses.festgeschriebenAt IS NOT
//      NULL`) per ADR-0006 — once the year is closed the row is sealed; the
//      settings-based gate is layered on top by `markExpenseErstattet` for
//      pre-close windows.
//   3. Does NOT emit `expense.erstattet` (which would fire ErstattungsMail).
//      Emits `expense.updated` so the audit-log timeline records the change.
// ---------------------------------------------------------------------------

export interface MarkExpenseAsPaidParams {
  /** ISO date string YYYY-MM-DD — the date money moved. */
  datum: string;
  /** Optional Zahlungsart FK. Pass `null` from the kebab quick-action. */
  zahlartId: string | null;
  actorUserId: string;
}

export type MarkExpenseAsPaidResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * True if `err` is a Postgres check-violation (SQLSTATE 23514). The
 * festschreibung trigger (`assert_not_festgeschrieben_fn`, migrations 0014/0034)
 * raises `check_violation` with NO constraint name, so we discriminate on the
 * SQLSTATE alone, walking the postgres-js → drizzle `cause` chain.
 */
export function isCheckViolation(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur != null; i++) {
    if (typeof cur === "object" && cur !== null && "code" in cur) {
      if ((cur as { code?: unknown }).code === "23514") return true;
    }
    cur =
      typeof cur === "object" && cur !== null && "cause" in cur
        ? (cur as { cause?: unknown }).cause
        : null;
  }
  return false;
}

export async function markExpenseAsPaid(
  expenseId: string,
  params: MarkExpenseAsPaidParams,
): Promise<MarkExpenseAsPaidResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.datum)) {
    return { ok: false, error: "Datum ungültig (YYYY-MM-DD erwartet)" };
  }

  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT festgeschrieben_at::text AS festgeschrieben_at,
           business_id,
           bezeichnung,
           betrag_cents,
           abfluss_datum::text AS abfluss_datum
      FROM expenses
     WHERE id = ${expenseId}::uuid
     LIMIT 1
  `)) as unknown as {
    festgeschrieben_at: string | null;
    business_id: string;
    bezeichnung: string;
    betrag_cents: string | number | bigint;
    abfluss_datum: string | null;
  }[];
  const row = rows[0];
  if (!row) return { ok: false, error: "Auslage nicht gefunden" };

  // ADR-0006 Nachtrag (payment carve-out): a festgeschriebene Auslage may still
  // be marked paid — the DB trigger (migration 0040) permits ONLY the payment
  // columns {erstattet_am, zahlungsart_id, status, updated_at}. We deliberately
  // do NOT pre-gate on festschreibung here: the trigger is the sole, precise
  // enforcer. The one blocked case is a Verein-direct row with NULL abfluss_datum
  // (the COALESCE below would set abfluss = payment date → move the Buchungsjahr,
  // which the trigger's locked-abfluss check rejects); that surfaces as the
  // 23514 catch → honest 409 below. A member/extern row (abfluss already set)
  // keeps its date via COALESCE and passes the carve-out.

  // Guard the write with `erstattet_am IS NULL` and RETURNING so an
  // already-erstattet row updates 0 rows (we lost no money — the row was
  // already paid). We use the returned row count as the authoritative "I
  // actually marked it" signal: a 0-row UPDATE must NOT report success and
  // must NOT emit a no-op `expense.updated` audit event (double-pay fix).
  //
  // `abfluss_datum` is preserved with COALESCE: a member/extern row already
  // carries its own cash-out date and must keep it; only a row that never had
  // one (Verein-direct, where the reimbursement IS the cash-out) takes `datum`.
  let updated: { id: string }[];
  try {
    updated = (await db.execute(sql`
      UPDATE expenses
         SET erstattet_am   = ${params.datum}::date,
             status         = 'erstattet',
             zahlungsart_id = ${params.zahlartId}::uuid,
             abfluss_datum  = COALESCE(abfluss_datum, ${params.datum}::date),
             updated_at     = NOW()
       WHERE id = ${expenseId}::uuid
         AND erstattet_am IS NULL
      RETURNING id
    `)) as unknown as { id: string }[];
  } catch (err) {
    // Post-carve-out (0040) the ONLY way this UPDATE trips the trigger is a
    // Verein-direct row with NULL abfluss_datum in a festgeschriebenes Jahr:
    // COALESCE would set abfluss = payment date and move the Buchungsjahr, which
    // the trigger rejects (23514). Honest refusal instead of an opaque 500.
    if (isCheckViolation(err)) {
      return {
        ok: false,
        error:
          "Diese Ausgabe hat kein Abfluss-Datum und liegt in einem festgeschriebenen Jahr — „Als bezahlt markieren“ würde das Buchungsjahr ändern und ist daher nicht möglich.",
      };
    }
    throw err;
  }

  if (updated.length === 0) {
    // Row already erstattet — refuse, and emit NO audit event.
    return { ok: false, error: "bereits bezahlt" };
  }

  // Audit-only emit (CLAUDE.md §2 — never write audit_log directly).
  await bus.emit("expense.updated", {
    id: expenseId,
    actorUserId: params.actorUserId,
    payload: {
      bezeichnung: row.bezeichnung,
      betragCents: Number(row.betrag_cents),
      kind: "mark_as_paid",
    },
  });

  return { ok: true };
}

export type FestschreibungGateResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function checkFestschreibungGate(
  yearOfBuchung: number,
): Promise<FestschreibungGateResult> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return { ok: true };
  const v = row.value;
  let festBis: number | null = null;
  if (typeof v === "number" && Number.isFinite(v)) festBis = v;
  else if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    if (Number.isFinite(parsed)) festBis = parsed;
  }
  if (festBis !== null && yearOfBuchung <= festBis) {
    return {
      ok: false,
      status: 409,
      error: `Jahr ${yearOfBuchung} ist festgeschrieben`,
    };
  }
  return { ok: true };
}
