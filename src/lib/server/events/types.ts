/**
 * Event payload type registry — §4.1.1 #2.
 *
 * Centralises the set of in-process events the app emits. Keys are
 * dot-separated namespaced event names; values are the payload shape.
 *
 * Consumers should use `EventName` and `EventPayload<K>` rather than
 * stringly-typing emit/on calls.
 */

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

  /** A new Mitglied was inserted via the admin UI. */
  "member.created": MemberEventPayload;
  /** A Mitglied's master data was updated. */
  "member.updated": MemberEventPayload;
  /** A Mitglied was soft-deleted (austritts_datum set). */
  "member.deleted": MemberEventPayload;
  /** A Beitrag year was marked as fully paid for a Mitglied. */
  "member.beitrag_paid": MemberEventPayload;
};

export type EventName = keyof Events;
export type EventPayload<K extends EventName> = Events[K];
