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

/**
 * Shared shape for direct-entry transaction events
 * (`expense.created`, `expense.updated`, `income.created`, `income.updated`,
 *  `donation.created`).
 *
 * The matching handler writes a row to `audit_log` with the corresponding
 * `entityKind` (`expense` | `income` | `donation`) and `action` (`create` |
 * `update`). Keeping a single shared shape avoids drift across the five
 * events and lets handlers be expressed as a tiny lookup table.
 */
export type TxMetaEventPayload = {
  /** Row PK (UUID). */
  id: string;
  /** Business id ('AUS-…', 'E-…', 'S-…'). Optional so update emits don't
   *  need to re-fetch it. */
  businessId?: string;
  actorUserId: string | null;
  /** Free-form diff or context (e.g. `{kind: 'erstattet'}`, the parsed form). */
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
   * Admin approved an Auslage submission in the audit inbox — triggers
   * ApprovalMail to the submitter via the bus handler (ADR-0005 idempotency).
   *
   * P2-B6: `send_attempt` is computed by the caller before emitting:
   * SELECT count(*) FROM sent_mails WHERE template='auslage_approved' AND entity_id=...
   * Default 0 for first approval; a re-approve-after-reject cycle increments
   * so ADR-0005's UNIQUE(template, entity_kind, entity_id, send_attempt) allows
   * a NEW row rather than silently deduping the legitimate re-send.
   */
  "auslage.approved": {
    submissionId: string;
    submissionBusinessId: string;
    submitterEmail: string | null;
    vorname: string | null;
    bezeichnung: string;
    betragCents: number;
    kategorie: string;
    decidedAt: string;
    decidedByUserId: string;
    /** P2-B6: per ADR-0005 UNIQUE(template, entity_kind, entity_id, send_attempt). */
    send_attempt: number;
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
  /**
   * An invoice PDF was successfully generated and persisted to Vercel Blob
   * via the files table. The sha256 anchor here lands in the hash-chained
   * audit_log so silent blob mutation is detectable post-hoc (ADR-0004 +
   * ADR-0012 in-band mitigation for the off-platform-backup gap).
   */
  "invoice.pdf_generated": {
    invoiceId: string;
    invoiceBusinessId: string;
    actorUserId: string | null;
    /** files.id of the persisted PDF, or null in test mode (storage=null). */
    fileId: string | null;
    sha256: string;
    byteSize: number;
  };
  /** A new invoice supersedes an older one (correction). */
  "invoice.superseded": {
    invoiceId: string;
    invoiceBusinessId: string;
    supersedesId: string;
    supersedesBusinessId: string;
    actorUserId: string | null;
  };

  /** A new expense was created via the direct-entry "Neue Transaktion" form
   *  (NOT via the public Auslagen submission flow — that emits
   *  `expense.approved` after audit-inbox approval). Audit handler writes
   *  an `audit_log` row with entity_kind='expense', action='create'. */
  "expense.created": TxMetaEventPayload;
  /** Existing expense's master data was edited via the detail page.
   *  Audit-only. Reimbursement state changes use `expense.erstattet`. */
  "expense.updated": TxMetaEventPayload;
  /** A new income row was inserted via the direct-entry form. */
  "income.created": TxMetaEventPayload;
  /** Existing income's master data was edited via the detail page. */
  "income.updated": TxMetaEventPayload;
  /** A new donation row was inserted via the direct-entry form. The
   *  Bescheinigung is allocated separately and emits
   *  `spende.bescheinigung_generated`. */
  "donation.created": TxMetaEventPayload;
  /** A booking was hard-deleted from its detail page (staged confirm;
   *  festschreibung / invoice-reference / Bescheinigung guards enforced
   *  server-side BEFORE the delete). Audit handler writes action='delete' so
   *  the removal stays in the append-only trail (ADR-0004) though the row is
   *  gone. */
  "expense.deleted": TxMetaEventPayload;
  "income.deleted": TxMetaEventPayload;
  "donation.deleted": TxMetaEventPayload;

  /** A new Mitglied was inserted via the admin UI. */
  "member.created": MemberEventPayload;
  /** A Mitglied's master data was updated. */
  "member.updated": MemberEventPayload;
  /** A Mitglied was soft-deleted (austritts_datum set). */
  "member.deleted": MemberEventPayload;
  /** A Beitrag year was marked as fully paid for a Mitglied. */
  "member.beitrag_paid": MemberEventPayload;

  /**
   * A previously-paid Beitrag year was reversed (storno). Emitted by
   * markBeitragUnpaid. Audit handler writes action='update' + kind='beitrag_unpaid'.
   *
   * P0-F1: prevPaidCents is number (not bigint) — bigint can't JSON-serialize
   * into the jsonb audit payload.
   */
  "member.beitrag_unpaid": {
    memberId: string;
    year: number;
    actorUserId: string | null;
    /** Previous paid amount in cents (number, NOT bigint — JSON-safe). */
    prevPaidCents: number;
    prevGezahltAm: string | null;
  };

  /**
   * A per-year Befreiung was granted or revoked via setBeitragExempt.
   * Audit handler writes action='update' + kind='exempt_granted'|'exempt_revoked'.
   *
   * P0-F1: prevPaidCents is NOT included; no cents in this payload.
   */
  "member.exempted": {
    memberId: string;
    year: number;
    exempt: boolean;
    reason: string | null;
    prevExempt: boolean;
    actorUserId: string | null;
  };

  /**
   * The annual Beitragssatz was changed via setBeitragssatz.
   * Audit handler writes entityKind='settings', action='update'.
   *
   * P0-F1: oldCents/newCents are number (not bigint) — JSON-safe.
   */
  "settings.beitragssatz_changed": {
    year: number;
    /** Previous cents value, or null if this is a new year entry. */
    oldCents: number | null;
    /** New cents value (number, NOT bigint — JSON-safe). */
    newCents: number;
    decisionNote: string | null;
    actorUserId: string | null;
  };

  // Phase 8 T6: "spende.created" event type removed. No emitter exists
  // (createDonation emits "donation.created" handled by txAuditMap).

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
