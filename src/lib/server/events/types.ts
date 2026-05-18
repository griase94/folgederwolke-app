/**
 * Event payload type registry — §4.1.1 #2.
 *
 * Centralises the set of in-process events the app emits. Keys are
 * dot-separated namespaced event names; values are the payload shape.
 *
 * Consumers should use `EventName` and `EventPayload<K>` rather than
 * stringly-typing emit/on calls.
 */

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
};

export type EventName = keyof Events;
export type EventPayload<K extends EventName> = Events[K];
