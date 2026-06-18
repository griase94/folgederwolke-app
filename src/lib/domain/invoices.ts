/**
 * Client-safe invoice view types.
 *
 * These types are serialised by `/app/rechnungen/+page.server.ts` and
 * consumed by Svelte components. No Date objects, no Buffers — everything
 * is JSON-safe.
 */

export type InvoicePdfStatus =
  | "not_generated"
  | "queued"
  | "running"
  | "generated"
  | "failed";

/**
 * Derived payment-state used for the /app/rechnungen filter chip from the
 * dashboard.
 *
 * Not a stored column — derived from `bezahlt_am` + `faelligkeits_datum`:
 *   - "offen"        → `bezahlt_am IS NULL`
 *   - "bezahlt"      → `bezahlt_am IS NOT NULL`
 *   - "überfällig"   → `bezahlt_am IS NULL AND faelligkeits_datum < today`
 *   - "alle"         → no filter (default when param is missing/unknown)
 */
export type RechnungenStatus = "offen" | "bezahlt" | "überfällig" | "alle";

export const RECHNUNGEN_STATUS_VALUES: readonly RechnungenStatus[] = [
  "offen",
  "bezahlt",
  "überfällig",
  "alle",
] as const;

export function rechnungenStatusLabel(status: RechnungenStatus): string {
  switch (status) {
    case "offen":
      return "Offen";
    case "bezahlt":
      return "Bezahlt";
    case "überfällig":
      return "Überfällig";
    case "alle":
      return "Alle";
  }
}

export interface InvoiceListFilters {
  status: RechnungenStatus;
  year: number;
}

/**
 * Parse + narrow the `?status=` and `?year=` searchParams off the /app/rechnungen
 * URL. Untrusted user input — anything unknown falls back to the supplied
 * defaults (status defaults to "alle", year defaults to `defaultYear`).
 *
 * Defaults come from the caller because the server-side load() should pass the
 * Berlin-aware `yearForBooking(new Date())` per ADR-0001.
 */
export function parseInvoiceFilters(
  params: URLSearchParams,
  defaultYear: number,
): InvoiceListFilters {
  const rawStatus = params.get("status");
  const status: RechnungenStatus =
    rawStatus !== null &&
    (RECHNUNGEN_STATUS_VALUES as readonly string[]).includes(rawStatus)
      ? (rawStatus as RechnungenStatus)
      : "alle";

  const rawYear = params.get("year");
  let year = defaultYear;
  if (rawYear !== null) {
    const parsed = parseInt(rawYear, 10);
    // Sanity bounds — Verein founded 2024-ish, dashboard year picker won't
    // reach 9999 in any realistic future. Reject NaN, negative, absurd.
    if (Number.isFinite(parsed) && parsed >= 2000 && parsed <= 9999) {
      year = parsed;
    }
  }

  return { status, year };
}

export interface InvoiceRow {
  id: string;
  businessId: string;
  rechnungsdatum: string;
  customerId: string;
  customerName: string;
  bezeichnung: string;
  nettoCents: number;
  bruttoCents: number;
  currency: string;
  pdfStatus: InvoicePdfStatus;
  /** FK to files.id once the blob upload + files row land. Null while
   *  queued/generating; the polling predicate is pdfStatus==='generated' &&
   *  pdfFileId !== null. */
  pdfFileId: string | null;
  festgeschriebenAt: string | null;
  supersedesId: string | null;
  /** Set on the predecessor when a newer invoice supersedes it. */
  supersededByBusinessId: string | null;
  /** ISO date (YYYY-MM-DD) when the invoice was marked as paid; null if open. */
  bezahltAm: string | null;
  /** FK to the auto-created income row (set together with bezahltAm). */
  paidByIncomeId: string | null;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceRow {
  leistungsDatum: string | null;
  faelligkeitsDatum: string | null;
  customerAddressSnapshot: string | null;
  kategorieId: string | null;
  kategorieNameSnapshot: string;
  sphereSnapshot: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
  projectId: string | null;
  projectName: string | null;
  leistungsBeschreibung: string | null;
  /** Leistungszeitraum per § 14 Abs. 4 Nr. 6 UStG. Always non-empty (DB NOT NULL). */
  leistungszeitraum: string;
  pdfStatusError: string | null;
  /** Business id of the linked income row (E-YYYY-NNN), populated on join. */
  paidByIncomeBusinessId: string | null;
}

/**
 * One audit_log row scoped to a single invoice — payload shape is
 * defined by the domain layer (`logAudit` callsites in
 * `src/lib/server/domain/invoices.ts`). The Verlauf component renders
 * specific `payload.kind` values; unknown kinds fall back to the action.
 */
export interface InvoiceHistoryEntry {
  occurredAt: string;
  action: "create" | "update" | "delete";
  actorName: string | null;
  payload: Record<string, unknown>;
}

/** Lightweight label for the InvoicePdfStatusBadge. */
export function pdfStatusLabel(status: InvoicePdfStatus): {
  label: string;
  tone: "default" | "primary" | "warning" | "destructive";
} {
  switch (status) {
    case "not_generated":
      return { label: "Noch nicht generiert", tone: "default" };
    case "queued":
      return { label: "In Warteschlange", tone: "warning" };
    case "running":
      return { label: "Wird erstellt …", tone: "warning" };
    case "generated":
      return { label: "Erstellt", tone: "primary" };
    case "failed":
      return { label: "Fehler", tone: "destructive" };
  }
}
