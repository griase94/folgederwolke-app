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

export type InvoiceDriveStatus =
  | "pending"
  | "uploaded"
  | "failed"
  | "skipped"
  | null;

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
  driveStatus: InvoiceDriveStatus;
  drivePdfFileId: string | null;
  hasPdfBytes: boolean;
  festgeschriebenAt: string | null;
  supersedesId: string | null;
  /** Set on the predecessor when a newer invoice supersedes it. */
  supersededByBusinessId: string | null;
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
  pdfStatusError: string | null;
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

export function driveStatusLabel(status: InvoiceDriveStatus): string | null {
  if (status === null) return null;
  switch (status) {
    case "pending":
      return "Drive-Upload offen";
    case "uploaded":
      return "Auf Drive gesichert";
    case "failed":
      return "Drive-Upload fehlgeschlagen";
    case "skipped":
      return "Drive übersprungen";
  }
}
