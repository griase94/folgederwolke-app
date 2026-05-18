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
