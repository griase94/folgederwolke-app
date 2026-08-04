/**
 * Portal home — greeting, the Willkommens-Karte, and the member's OWN Auslagen
 * (Aurora A-flow S2a + S2b).
 *
 * SECURITY: the list is scoped to `bezahlt_von_member_id = session member`.
 * The member_id comes from the resolved session (set at consume time from the
 * allowlist), NEVER from the client — a member can only ever see their own
 * submissions. Status is derived server-side via the shared `deriveStatus` so
 * the portal, the public status page, and the batch group never disagree.
 *
 * PRIVACY: the full `members.iban` never enters a payload. The layout hands
 * down the masked form; the actions below answer with the masked form too.
 */

import { fail, redirect } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { users } from "$lib/server/db/schema/users.js";
import { deriveStatus } from "$lib/server/domain/auslage-status.js";
import {
  updateMemberIban,
  InvalidIbanError,
} from "$lib/server/domain/member-iban.js";
import { maskIbanDisplay } from "$lib/domain/iban.js";

/** The ratified error copy — the same wording the client shows. */
const IBAN_ERROR = "Das ist keine gültige IBAN — prüf Ländercode und Länge.";

export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.session?.user.memberId;
  const userId = locals.session?.user.id;
  // The layout guard + hooks already enforce this; re-assert so the scoped
  // query can never run with an undefined member_id (which would match NULLs).
  if (!memberId || !userId) redirect(303, "/app");

  const db = getDb();
  const rows = await db
    .select({
      businessId: auslagenSubmissions.businessId,
      bezeichnung: auslagenSubmissions.bezeichnung,
      betragCents: auslagenSubmissions.betragCents,
      rechnungsdatum: auslagenSubmissions.rechnungsdatum,
      decision: auslagenSubmissions.decision,
      decidedAt: auslagenSubmissions.decidedAt,
      reviewedAt: auslagenSubmissions.reviewedAt,
      erstattetAm: expenses.erstattetAm,
    })
    .from(auslagenSubmissions)
    .leftJoin(expenses, eq(expenses.id, auslagenSubmissions.approvedExpenseId))
    .where(eq(auslagenSubmissions.bezahltVonMemberId, memberId))
    .orderBy(desc(auslagenSubmissions.submittedAt));

  const auslagen = rows.map((r) => ({
    businessId: r.businessId,
    bezeichnung: r.bezeichnung,
    // Verein-scale amounts fit safely in a JS number; formatMoney takes cents.
    betragCents: Number(r.betragCents),
    rechnungsdatum: r.rechnungsdatum,
    status: deriveStatus({
      decision: r.decision,
      decidedAt: r.decidedAt,
      reviewedAt: r.reviewedAt,
      erstattetAm: r.erstattetAm,
    }),
  }));

  // Summenzeile — derived from the rows we already hold. A member has a
  // handful of submissions, so a second aggregate query would buy nothing.
  // "Offen" = what is still owed to them: everything not yet paid out and not
  // rejected. That is the number they came here for.
  const offenCents = auslagen
    .filter((a) => a.status !== "erstattet" && a.status !== "abgelehnt")
    .reduce((sum, a) => sum + a.betragCents, 0);
  const erstattetCents = auslagen
    .filter((a) => a.status === "erstattet")
    .reduce((sum, a) => sum + a.betragCents, 0);

  // The Willkommens-Karte shows until it is resolved ONCE — device-independent,
  // because the stamp lives on the user row. Leaving without answering is not
  // a rejection: an unresolved card comes back next visit.
  const [me] = await db
    .select({ welcomeSeenAt: users.welcomeSeenAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return {
    auslagen,
    summen: { offenCents, erstattetCents, anzahl: auslagen.length },
    showWelcome: !me?.welcomeSeenAt,
  };
};

/** Stamp the card as resolved. Idempotent: a second call just rewrites it. */
async function stampWelcomeSeen(
  userId: string,
  tx: Pick<ReturnType<typeof getDb>, "update">,
): Promise<void> {
  await tx
    .update(users)
    .set({ welcomeSeenAt: new Date() })
    .where(eq(users.id, userId));
}

export const actions: Actions = {
  /**
   * "IBAN speichern" (W1) and "Stimmt nicht mehr — neue eintragen" (W2).
   * Write and stamp share ONE transaction, so the card is never resolved for
   * an IBAN that failed to save — and never saves without resolving.
   */
  welcomeIban: async ({ request, locals }) => {
    const memberId = locals.session?.user.memberId;
    const userId = locals.session?.user.id;
    if (!memberId || !userId) redirect(303, "/app");

    const form = await request.formData();
    const raw = String(form.get("iban") ?? "").trim();
    if (!raw) return fail(422, { welcomeError: IBAN_ERROR });

    const db = getDb();
    try {
      const { iban } = await db.transaction(async (tx) => {
        const result = await updateMemberIban(
          {
            memberId,
            rawIban: raw,
            actorUserId: userId,
            source: "onboarding_card",
          },
          tx,
        );
        await stampWelcomeSeen(userId, tx);
        return result;
      });
      // Masked only — the stored IBAN never travels back to the client.
      return { welcomeSaved: true, maskedIban: maskIbanDisplay(iban) };
    } catch (err) {
      if (err instanceof InvalidIbanError) {
        return fail(422, { welcomeError: IBAN_ERROR });
      }
      throw err;
    }
  },

  /** "Später" (W1) and "Passt so" (W2) — resolve the card, write nothing else. */
  welcomeDismiss: async ({ locals }) => {
    const userId = locals.session?.user.id;
    if (!userId) redirect(303, "/app");
    await stampWelcomeSeen(userId, getDb());
    return { welcomeDismissed: true };
  },
};
