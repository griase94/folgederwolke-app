/**
 * Domain helpers for the merged Transactions view (Phase 5).
 *
 * Exports:
 *  - listTransactions: unified query over expenses + income + donations with
 *    optional filters (type, search, year, month, festschreibung-aware).
 *  - getTransactionDetail: single-row detail with audit_log timeline.
 *  - listZahlungsarten: for dropdowns.
 *  - deriveSphere: from sphere_override (pre-Festschreibung) else sphere_snapshot.
 *
 * No schema changes — read-only queries only (§5.4 spec).
 */

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { deriveDonationKategorieName } from "$lib/domain/spenden-kategorie.js";
import type { Sphere } from "$lib/domain/sphere.js";
import { zahlungsarten } from "$lib/server/db/schema/zahlungsarten.js";
import { members } from "$lib/server/db/schema/members.js";
import { bus } from "$lib/server/events/index.js";

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
  /** ISO date string YYYY-MM-DD or null */
  rechnungsdatum: string | null;
  sphereSnapshot: string;
  sphereEffective: string;
  kategorieNameSnapshot: string;
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
  belegOriginalName: string | null;
  approvedAt: string | null;
  /** donation only */
  spenderName: string | null;
  spenderEmail: string | null;
  bescheinigungNr: string | null;
  spendeKind: string | null;
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
// listTransactions — merged view
// ---------------------------------------------------------------------------

export interface ListTransactionsOptions {
  /** If omitted, returns all three kinds. */
  kind?: TransactionKind;
  search?: string;
  year?: number;
  month?: number; // 1-12
  limit?: number;
  offset?: number;
}

export async function listTransactions(
  opts: ListTransactionsOptions = {},
): Promise<{ rows: TransactionRow[]; total: number }> {
  const db = getDb();
  const { kind, search, year, month, limit = 50, offset = 0 } = opts;

  const allRows: TransactionRow[] = [];

  const searchLike = search ? `%${search}%` : null;

  // ── Expenses ──────────────────────────────────────────────────────────────
  if (!kind || kind === "expense") {
    const conditions = [];
    if (searchLike) {
      conditions.push(
        or(
          ilike(expenses.bezeichnung, searchLike),
          ilike(expenses.bezahltVonDisplay, searchLike),
        ),
      );
    }
    if (year) conditions.push(eq(expenses.yearOfBuchung, year));
    if (month) {
      conditions.push(
        sql`EXTRACT(MONTH FROM ${expenses.gebuchtAm} AT TIME ZONE 'Europe/Berlin') = ${month}`,
      );
    }

    const rows = await db
      .select({
        id: expenses.id,
        businessId: expenses.businessId,
        bezeichnung: expenses.bezeichnung,
        betragCents: expenses.betragCents,
        currency: expenses.currency,
        gebuchtAm: expenses.gebuchtAm,
        rechnungsdatum: expenses.rechnungsdatum,
        sphereSnapshot: expenses.sphereSnapshot,
        sphereOverride: expenses.sphereOverride,
        kategorieNameSnapshot: expenses.kategorieNameSnapshot,
        status: expenses.status,
        erstattetAm: expenses.erstattetAm,
        bezahltVonDisplay: expenses.bezahltVonDisplay,
        festgeschriebenAt: expenses.festgeschriebenAt,
        yearOfBuchung: expenses.yearOfBuchung,
      })
      .from(expenses)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(expenses.gebuchtAm));

    for (const r of rows) {
      allRows.push({
        id: r.id,
        kind: "expense",
        businessId: r.businessId,
        bezeichnung: r.bezeichnung,
        betragCents: Number(r.betragCents),
        currency: r.currency,
        gebuchtAm: formatTs(r.gebuchtAm)!,
        rechnungsdatum: r.rechnungsdatum ?? null,
        sphereSnapshot: r.sphereSnapshot,
        sphereEffective: r.sphereOverride ?? r.sphereSnapshot,
        kategorieNameSnapshot: r.kategorieNameSnapshot,
        status: r.status,
        erstattetAm: r.erstattetAm ?? null,
        bezahltVonDisplay: r.bezahltVonDisplay,
        festgeschriebenAt: formatTs(r.festgeschriebenAt),
        yearOfBuchung: r.yearOfBuchung ?? null,
      });
    }
  }

  // ── Income ────────────────────────────────────────────────────────────────
  if (!kind || kind === "income") {
    const conditions = [];
    if (searchLike) {
      conditions.push(ilike(income.bezeichnung, searchLike));
    }
    if (year) conditions.push(eq(income.yearOfBuchung, year));
    if (month) {
      conditions.push(
        sql`EXTRACT(MONTH FROM ${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin') = ${month}`,
      );
    }

    const rows = await db
      .select({
        id: income.id,
        businessId: income.businessId,
        bezeichnung: income.bezeichnung,
        betragCents: income.betragCents,
        currency: income.currency,
        gebuchtAm: income.gebuchtAm,
        rechnungsdatum: income.rechnungsdatum,
        sphereSnapshot: income.sphereSnapshot,
        kategorieNameSnapshot: income.kategorieNameSnapshot,
        festgeschriebenAt: income.festgeschriebenAt,
        yearOfBuchung: income.yearOfBuchung,
      })
      .from(income)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(income.gebuchtAm));

    for (const r of rows) {
      allRows.push({
        id: r.id,
        kind: "income",
        businessId: r.businessId,
        bezeichnung: r.bezeichnung,
        betragCents: Number(r.betragCents),
        currency: r.currency,
        gebuchtAm: formatTs(r.gebuchtAm)!,
        rechnungsdatum: r.rechnungsdatum ?? null,
        sphereSnapshot: r.sphereSnapshot,
        sphereEffective: r.sphereSnapshot,
        kategorieNameSnapshot: r.kategorieNameSnapshot,
        status: null,
        erstattetAm: null,
        bezahltVonDisplay: null,
        festgeschriebenAt: formatTs(r.festgeschriebenAt),
        yearOfBuchung: r.yearOfBuchung ?? null,
      });
    }
  }

  // ── Donations ─────────────────────────────────────────────────────────────
  if (!kind || kind === "donation") {
    const conditions = [];
    if (searchLike) {
      conditions.push(
        or(
          ilike(donations.kategorieNameSnapshot, searchLike),
          ilike(donations.spenderName, searchLike),
        ),
      );
    }
    if (year) conditions.push(eq(donations.yearOfBuchung, year));
    if (month) {
      conditions.push(
        sql`EXTRACT(MONTH FROM ${donations.gebuchtAm} AT TIME ZONE 'Europe/Berlin') = ${month}`,
      );
    }

    const rows = await db
      .select({
        id: donations.id,
        businessId: donations.businessId,
        betragCents: donations.betragCents,
        currency: donations.currency,
        gebuchtAm: donations.gebuchtAm,
        sphereSnapshot: donations.sphereSnapshot,
        kategorieNameSnapshot: donations.kategorieNameSnapshot,
        festgeschriebenAt: donations.festgeschriebenAt,
        yearOfBuchung: donations.yearOfBuchung,
        spenderName: donations.spenderName,
      })
      .from(donations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(donations.gebuchtAm));

    for (const r of rows) {
      allRows.push({
        id: r.id,
        kind: "donation",
        businessId: r.businessId,
        bezeichnung: r.spenderName
          ? `Spende von ${r.spenderName}`
          : r.kategorieNameSnapshot,
        betragCents: Number(r.betragCents),
        currency: r.currency,
        gebuchtAm: formatTs(r.gebuchtAm)!,
        rechnungsdatum: null,
        sphereSnapshot: r.sphereSnapshot,
        sphereEffective: r.sphereSnapshot,
        kategorieNameSnapshot: r.kategorieNameSnapshot,
        status: null,
        erstattetAm: null,
        bezahltVonDisplay: r.spenderName ?? null,
        festgeschriebenAt: formatTs(r.festgeschriebenAt),
        yearOfBuchung: r.yearOfBuchung ?? null,
      });
    }
  }

  // Sort merged list descending by gebuchtAm
  allRows.sort(
    (a, b) => new Date(b.gebuchtAm).getTime() - new Date(a.gebuchtAm).getTime(),
  );

  const total = allRows.length;
  return { rows: allRows.slice(offset, offset + limit), total };
}

// ---------------------------------------------------------------------------
// getTransactionDetail
// ---------------------------------------------------------------------------

export async function getTransactionDetail(
  id: string,
  kind: TransactionKind,
): Promise<TransactionDetail | null> {
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
      rechnungsdatum: r.rechnungsdatum ?? null,
      sphereSnapshot: r.sphereSnapshot,
      sphereEffective: r.sphereOverride ?? r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
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
      belegOriginalName: r.belegOriginalName ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      spenderName: null,
      spenderEmail: null,
      bescheinigungNr: null,
      spendeKind: null,
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
    base = {
      id: r.id,
      kind: "income",
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: Number(r.betragCents),
      currency: r.currency,
      gebuchtAm: r.gebuchtAm.toISOString(),
      rechnungsdatum: r.rechnungsdatum ?? null,
      sphereSnapshot: r.sphereSnapshot,
      sphereEffective: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
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
      belegOriginalName: r.belegOriginalName ?? null,
      approvedAt: null,
      spenderName: null,
      spenderEmail: null,
      bescheinigungNr: null,
      spendeKind: null,
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
      rechnungsdatum: null,
      sphereSnapshot: r.sphereSnapshot,
      sphereEffective: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
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
      belegDriveFileId: null,
      belegOriginalName: null,
      approvedAt: null,
      spenderName: r.spenderName ?? null,
      spenderEmail: r.spenderEmail ?? null,
      bescheinigungNr: r.bescheinigungNr ?? null,
      spendeKind: r.spendeKind,
      timeline: [],
    };
  }

  if (!base) return null;

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
  kategorieId?: string | null;
  kategorieNameSnapshot: string;
  // P1-T7 (spec §4.5): sphere is now DERIVED from the resolved kategorie —
  // STRICT (no project override). Accepted-but-ignored for caller parity.
  sphereSnapshot?: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
  bezahltVonKind: "verein" | "member" | "extern";
  bezahltVonMemberId?: string | null;
  bezahltVonDisplay: string;
  externName?: string | null;
  externIban?: string | null;
  externEmail?: string | null;
  projectId?: string | null;
  /** C2-TAX: FK into the normalized `files` table for the attached Beleg. */
  belegFileId?: string | null;
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
  kategorieId?: string | null;
  kategorieNameSnapshot: string;
  // P1-T7 (spec §4.5): sphere is now DERIVED from the resolved kategorie —
  // STRICT (no project override). Accepted-but-ignored for caller parity.
  sphereSnapshot?: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
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
  // P1-T7 (spec §4.5): resolve a non-null kategorie by NAME and derive sphere
  // STRICTLY from it (no project override). Closes the null-kategorie_id path
  // before the NOT NULL constraint lands in a later task. NOTE: `input.kategorieId`
  // is intentionally NOT honored — resolution is name-authoritative, so a future
  // caller can't assume by-id wins.
  const kat = await resolveKategorieByName(
    "expense",
    input.kategorieNameSnapshot,
  );
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
  // P1-T7 (spec §4.5): resolve a non-null kategorie by NAME and derive sphere
  // STRICTLY from it (no project override). Closes the null-kategorie_id path
  // before the NOT NULL constraint lands in a later task. NOTE: `input.kategorieId`
  // is intentionally NOT honored — resolution is name-authoritative, so a future
  // caller can't assume by-id wins.
  const kat = await resolveKategorieByName(
    "income",
    input.kategorieNameSnapshot,
  );
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
           betrag_cents
      FROM expenses
     WHERE id = ${expenseId}::uuid
     LIMIT 1
  `)) as unknown as {
    festgeschrieben_at: string | null;
    business_id: string;
    bezeichnung: string;
    betrag_cents: string | number | bigint;
  }[];
  const row = rows[0];
  if (!row) return { ok: false, error: "Auslage nicht gefunden" };
  if (row.festgeschrieben_at !== null) {
    return {
      ok: false,
      error: "Auslage ist festgeschrieben — Bezahlt-Markierung verweigert",
    };
  }

  await db.execute(sql`
    UPDATE expenses
       SET erstattet_am   = ${params.datum}::date,
           status         = 'erstattet',
           zahlungsart_id = ${params.zahlartId}::uuid,
           abfluss_datum  = ${params.datum}::date,
           updated_at     = NOW()
     WHERE id = ${expenseId}::uuid
       AND erstattet_am IS NULL
  `);

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
