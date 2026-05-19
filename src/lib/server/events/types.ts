/**
 * Event payload type registry — §4.1.1 #2.
 *
 * Centralises the set of in-process events the app emits. Keys are
 * dot-separated namespaced event names; values are the payload shape.
 *
 * Consumers should use `EventName` and `EventPayload<K>` rather than
 * stringly-typing emit/on calls.
 */

/** Shared shape for `project.*` events — emitted by the Projekte CRUD paths.
 *  The matching handler writes a row to `audit_log` with entity_kind='project'.
 */
export type ProjectEventPayload = {
  projectId: string;
  actorUserId: string | null;
  payload?: Record<string, unknown>;
};

/** Shared shape for `customer.*` events — emitted by the Kunden CRUD paths.
 *  The matching handler writes a row to `audit_log` with entity_kind='customer'.
 */
export type CustomerEventPayload = {
  customerId: string;
  actorUserId: string | null;
  payload?: Record<string, unknown>;
};

/** Shared shape for `member.*` events — emitted by the Mitglieder CRUD paths.
 *  The matching handler writes a row to `audit_log` with entity_kind='member'.
 */
export type MemberEventPayload = {
  memberId: string;
  actorUserId: string | null;
  /** Optional free-form structured payload stored in audit_log.payload. */
  payload?: Record<string, unknown>;
};

export type Events = {
  /** Public Auslage form submission completed (Drive upload + DB insert OK). */
  "auslagen.submitted": {
    submissionId: string;
    ausId: string;
    /** Recipient email, if any (extern or member with email). */
    email: string | null;
    /** First name for personalised greeting in mail. */
    vorname: string;
    bezeichnung: string;
    betragCents: number;
    driveFileId: string | null;
    consentTextVersion: string;
    ipPrefix: string;
    /** Hashed UA string for the audit row. */
    userAgentHash: string;
    /** bezahlt_von kind for the audit payload. */
    bezahltVonKind: "member" | "extern" | "verein";
  };

  /**
   * Admin approved a submission in the audit inbox — an `expenses` row was
   * created with `approved_at = now()` and the submission was linked to it.
   * Triggers an audit_log row (no mail; payment confirmation is fired later
   * by `expense.erstattet` once the admin marks it paid).
   */
  "expense.approved": {
    expenseId: string;
    expenseBusinessId: string;
    submissionId: string;
    submissionBusinessId: string;
    actorUserId: string | null;
    betragCents: number;
    bezeichnung: string;
  };

  /**
   * Admin clicked "Speichern und Mitglied benachrichtigen" on a transaction
   * detail page — the expense is now marked as reimbursed and the
   * ErstattungsMail is sent (handler dedupes via sent_mails UNIQUE).
   */
  "expense.erstattet": {
    expenseId: string;
    expenseBusinessId: string;
    actorUserId: string | null;
    /** Recipient email — `null` skips the mail (e.g. bezahlt_von = verein). */
    email: string | null;
    vorname: string;
    bezeichnung: string;
    betragCents: number;
    /** Free-form Verwendungszweck shown on the mail's detail card. */
    verwendungszweck: string;
    erstattungsAm: Date;
  };

  /**
   * Admin rejected a submission in the audit inbox. The submission's
   * `decision='rejected'` + `decided_at` were set, no expense row created;
   * the registered handler writes audit_log and (best-effort) sends the
   * rejection mail.
   */
  "auslage.rejected": {
    submissionId: string;
    submissionBusinessId: string;
    actorUserId: string | null;
    email: string | null;
    vorname: string;
    bezeichnung: string;
    betragCents: number;
    grund: string;
  };

  /**
   * Admin opened an `auslagen_submissions` row in the audit inbox for the
   * first time. Handler sets `reviewed_at = now()` if NULL and writes a
   * single `audit_log` row (entityKind='auslagen_submission'). Emitting the
   * event multiple times is safe — the handler is a no-op once reviewed_at
   * is non-null.
   */
  "auslage.reviewed": {
    submissionId: string;
    ausId: string;
    actorUserId: string | null;
  };

  /** A new Projekt was inserted via the admin UI. */
  "project.created": ProjectEventPayload;
  /** A Projekt's master data was updated. */
  "project.updated": ProjectEventPayload;
  /** A Projekt was soft-deleted (deleted_at set). */
  "project.deleted": ProjectEventPayload;

  /** A new Kunde was inserted via the admin UI. */
  "customer.created": CustomerEventPayload;
  /** A Kunde's master data was updated. */
  "customer.updated": CustomerEventPayload;
  /** A Kunde was soft-deleted (deleted_at set). */
  "customer.deleted": CustomerEventPayload;

  /** A new invoice row was inserted via the admin UI (no PDF yet). */
  "invoice.created": {
    invoiceId: string;
    invoiceBusinessId: string;
    actorUserId: string | null;
    customerId: string;
    customerNameSnapshot: string;
    bruttoCents: number;
  };
  /** An invoice PDF was successfully generated (pdf_bytes populated). */
  "invoice.pdf_generated": {
    invoiceId: string;
    invoiceBusinessId: string;
    actorUserId: string | null;
    /** Best-effort Drive id (null if upload failed). */
    drivePdfFileId: string | null;
    driveStatus: "uploaded" | "failed" | "pending" | "skipped";
  };
  /** A new invoice supersedes an older one (correction). */
  "invoice.superseded": {
    invoiceId: string;
    invoiceBusinessId: string;
    supersedesId: string;
    supersedesBusinessId: string;
    actorUserId: string | null;
  };

  /** A new Mitglied was inserted via the admin UI. */
  "member.created": MemberEventPayload;
  /** A Mitglied's master data was updated. */
  "member.updated": MemberEventPayload;
  /** A Mitglied was soft-deleted (austritts_datum set). */
  "member.deleted": MemberEventPayload;
  /** A Beitrag year was marked as fully paid for a Mitglied. */
  "member.beitrag_paid": MemberEventPayload;

  /**
   * A new Spende was created via the admin UI. Audit-log handler writes a
   * `donation` row with action='create'. No mail is sent here — the
   * Bescheinigungs-Mail is fired on `spende.bescheinigung_generated`.
   */
  "spende.created": {
    donationId: string;
    businessId: string;
    actorUserId: string | null;
    betragCents: number;
    spendeKind: "geldspende" | "sachspende" | "aufwandsspende";
    memberId: string | null;
  };

  /** Spende master data was edited (pre-Bescheinigung). Audit only. */
  "spende.edited": {
    donationId: string;
    actorUserId: string | null;
  };

  /**
   * A Zuwendungsbestätigung (Bescheinigung) was issued for a Spende — the
   * Bescheinigungs-Nr is now persisted and a PDF is available. Handler
   * writes audit_log; mail-send remains manual in v1.
   */
  "spende.bescheinigung_generated": {
    donationId: string;
    bescheinigungNr: string;
    actorUserId: string | null;
    betragCents: number;
  };
};

export type EventName = keyof Events;
export type EventPayload<K extends EventName> = Events[K];
