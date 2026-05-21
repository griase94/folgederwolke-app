/**
 * Client-safe inbox view types — used by Audit Inbox components
 * (`/app/inbox` list + `/app/inbox/[ausId]` detail).
 *
 * Server load functions in src/routes/app/inbox project the schema rows into
 * these shapes so components are not coupled to drizzle types and so all
 * timestamps + cents are pre-serialised to JSON-safe primitives.
 */

export interface InboxSubmissionView {
  /** UUID PK of the submission row. */
  id: string;
  /** Business ID, e.g. "AUS-2026-007". */
  ausId: string;
  bezeichnung: string;
  /** Integer cents (post-JSON-serialise of bigint). */
  betragCents: number;
  currency: string;
  bezahltVonKind: "member" | "extern" | "verein";
  bezahltVonDisplay: string;
  /** Member id when bezahlt_von_kind = 'member'. */
  bezahltVonMemberId: string | null;
  /** Member display string for the linked Mitglied, if any. */
  bezahltVonMemberDisplay: string | null;
  /** Optional Rechnungsdatum (ISO date). */
  rechnungsdatum: string | null;
  /** ISO timestamp of submission. */
  submittedAt: string;
  /** ISO timestamp of first admin open (null = unreviewed). */
  reviewedAt: string | null;
  /** Drive file ID for the Beleg, or null if none. */
  belegDriveFileId: string | null;
  /**
   * Phase 9: FK into normalized `files` table. Either this or
   * `belegDriveFileId` should be non-null when the submission carries a Beleg.
   * The inbox list uses `hasBeleg = belegDriveFileId !== null || belegFileId !== null`
   * to render the "has-Beleg" icon.
   */
  belegFileId: string | null;
  /** Original filename of the Beleg. */
  belegOriginalName: string | null;
  /** Optional project id link — currently null on submissions but reserved. */
  projectId: string | null;
  /** Project display name when projectId is set. */
  projectName: string | null;
  /** Free-form "Wofür war die Ausgabe" string. */
  wofuer: string | null;
  /** Free-form admin comment from submitter. */
  kommentar: string | null;
}

/**
 * Detail-view extension with extra fields only the detail card renders:
 * - extern IBAN (masked client-side, full value never serialised to wire)
 * - extern email / name (already in display, but separated for layout)
 * - member context block (austrittsDatum, totals — populated only when linked)
 */
export interface InboxSubmissionDetailView extends InboxSubmissionView {
  externName: string | null;
  /** Masked IBAN string ("DE12 …3000") — never the full IBAN. */
  externIbanMasked: string | null;
  externEmail: string | null;
  /** Datenschutz consent text version (snapshot at submit time). */
  consentTextVersion: string;
  consentGivenAt: string;
  /** ISO timestamp of submitter consent. */
  submitterIpPrefix: string | null;
  /**
   * Legacy Drive view-URL for pre-Phase-9 submissions. Phase 9 submissions
   * use `belegFileId` (FK into the `files` table) and render via
   * `/api/files/{fileId}/blob` through `FilePreview`. Always null in the
   * current code path — kept on the type for backwards compatibility until
   * the legacy `belegDriveFileId` column is dropped in PR2.
   *
   * FIXME(Phase 9 follow-up: backfill drive→blob) — remove this field
   * alongside `belegDriveFileId` once the schema migration lands.
   */
  belegViewLink: string | null;
  /**
   * Phase 9: FK into the normalized `files` table. Non-null for submissions
   * uploaded after the Phase 9 cutover. When set, the detail page renders
   * the blob via `/api/files/{belegFileId}/blob` via the FilePreview component.
   */
  belegFileId: string | null;
  /** MIME type from the `files` row (only when `belegFileId` is set). */
  belegMimeType: string | null;
  /** Original filename from the `files` row (only when `belegFileId` is set). */
  belegOriginalFilename: string | null;
  /** Member context block — populated only when bezahlt_von_kind = 'member'. */
  memberContext: {
    id: string;
    vorname: string;
    nachname: string;
    email: string | null;
    austrittsDatum: string | null;
  } | null;
}

/**
 * Mask an IBAN to "DE12 …3000" form (first 4 chars + last 4 chars).
 * Used by server projections before the value reaches the client.
 */
export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const trimmed = iban.replace(/\s+/g, "");
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)} … ${trimmed.slice(-4)}`;
}
