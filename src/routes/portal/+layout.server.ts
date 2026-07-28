/**
 * Portal layout server load — member self-service area (Aurora A-flow S2a).
 *
 * hooks.server.ts already gates /portal/** (session required; member_self_service
 * or an admin who is also a member). This load re-asserts defensively and
 * hydrates the display identity from the LINKED Mitglied row — never from the
 * client. The full IBAN never enters a portal payload (privacy rule §2.2b); the
 * masked form and the einreichen surface arrive in S2b.
 */

import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types.js";
import { getActiveMemberById } from "$lib/server/auth/member-allowlist.js";

export const load: LayoutServerLoad = async ({ locals }) => {
  const session = locals.session;
  // Defense-in-depth: hooks already redirect these, but a load must never
  // trust that and render a member surface without a member identity.
  if (!session) redirect(303, "/sign-in?redirectTo=/portal");

  const memberId = session.user.memberId;
  if (!memberId) redirect(303, "/app");

  const member = await getActiveMemberById(memberId);
  // The resolveSession re-check already nukes deactivated members, so a live
  // session with a now-missing member is not reachable — but guard anyway.
  if (!member) redirect(303, "/sign-in?reason=not-authorised");

  return {
    member: {
      id: member.id,
      vorname: member.vorname,
      nachname: member.nachname,
      email: member.email,
    },
  };
};
