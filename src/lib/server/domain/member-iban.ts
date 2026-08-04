/**
 * The ONE member-IBAN write path (Aurora A-flow S2b).
 *
 * Three callers write `members.iban`: the Willkommens-Karte (onboarding), the
 * Fall-B/C arm of a member Auslage submit (via `submitAuslagenBatch`), and the
 * Profil IbanInlineEdit. They ALL funnel through here so the write is ALWAYS
 * normalized + validated and ALWAYS leaves an in-tx audit anchor (ADR-0004 —
 * NOT a bus event; the ratified A-S0 deviation (b) follows the public-route
 * audit precedent, and the newer onboarding-iban brief agrees). Pass the
 * surrounding `tx` so the write + anchor commit atomically with the caller:
 * the submit's batch transaction, or a standalone one-statement transaction for
 * the card / profil actions. The live `members.iban` is the deliberate payout
 * fallback; per-submission payout targets snapshot `erstattung_iban` instead.
 */

import { eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { logAudit } from "$lib/server/audit-log/index.js";
import { normalizeIban, validateIban } from "./iban.js";

/** DB handle that can UPDATE members and INSERT the audit anchor (db or tx). */
type IbanWriter = Pick<ReturnType<typeof getDb>, "update" | "insert">;

/** Where the write originated — recorded in the audit payload for the trail. */
export type MemberIbanWriteSource =
  | "onboarding_card"
  | "auslage_submit"
  | "profil";

/**
 * Thrown when a raw IBAN fails checksum/format validation. Callers should
 * validate at the form layer first and surface a field error; this is the
 * server-side backstop that keeps an invalid value from ever persisting.
 */
export class InvalidIbanError extends Error {
  constructor() {
    super("INVALID_IBAN");
    this.name = "InvalidIbanError";
  }
}

export async function updateMemberIban(
  args: {
    memberId: string;
    rawIban: string;
    actorUserId: string | null;
    source: MemberIbanWriteSource;
  },
  tx: IbanWriter,
): Promise<{ iban: string }> {
  const iban = normalizeIban(args.rawIban);
  if (!validateIban(iban)) throw new InvalidIbanError();

  await tx
    .update(members)
    .set({ iban, updatedAt: new Date() })
    .where(eq(members.id, args.memberId));

  await logAudit(
    {
      action: "update",
      entityKind: "member",
      entityId: args.memberId,
      actorUserId: args.actorUserId,
      actorKind: args.actorUserId ? "user" : "system",
      payload: { kind: "iban_updated", source: args.source },
    },
    tx,
  );

  return { iban };
}
