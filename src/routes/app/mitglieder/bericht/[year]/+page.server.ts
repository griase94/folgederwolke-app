/**
 * /app/mitglieder/bericht/[year] — printable Kassenbericht (Task 3.5 / spec §11).
 *
 * Loads per-member Beitragsstatus for a given year: paid, open, or exempt.
 * Computes totals (paid sum, open sum, exempt count) for the Kassenprüfer report.
 * Auth-gated via the /app layout (hooks.server.ts redirects if unauthenticated).
 */

import { error } from "@sveltejs/kit";
import { and, eq, inArray } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";

export type BerichtRow = {
  memberId: string;
  name: string;
  /** ISO date of entry, for Kassenprüfer cross-reference. */
  eintrittsDatum: string | null;
  status: "paid" | "open" | "exempt";
  betragCents: number;
  paidCents: number;
  gezahltAm: string | null;
  exemptReason: string | null;
};

export const load: PageServerLoad = async ({ params, locals }) => {
  // Defense-in-depth (ADR-0009): the Kassenbericht exposes every member's
  // payment status, so gate it explicitly to Vorstand (admin) + Kassenprüfer
  // (steuerberater) rather than relying solely on the session allowlist.
  const role = locals.session?.user.role;
  if (role !== "admin" && role !== "steuerberater") {
    error(
      403,
      "Nur Vorstand und Kassenprüfer dürfen den Kassenbericht öffnen.",
    );
  }

  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const db = getDb();

  // Load the Beitragssatz for this year (may be null if never set).
  const [satz] = await db
    .select({
      cents: beitragssatzByYear.cents,
      faelligkeitAt: beitragssatzByYear.faelligkeitAt,
    })
    .from(beitragssatzByYear)
    .where(eq(beitragssatzByYear.year, year));

  // Load all members (including ausgetretene — the report covers whoever was
  // active in that year, or had a Beitrag row, not just current members).
  const allMembers = await db
    .select({
      id: members.id,
      vorname: members.vorname,
      nachname: members.nachname,
      eintrittsDatum: members.eintrittsDatum,
      austrittsDatum: members.austrittsDatum,
      beitragExempt: members.beitragExempt,
      beitragExemptReason: members.beitragExemptReason,
    })
    .from(members)
    .orderBy(members.nachname, members.vorname);

  const memberIds = allMembers.map((m) => m.id);

  // Load all Beitrag rows for this year.
  let beitragRows: (typeof memberBeitrags.$inferSelect)[] = [];
  if (memberIds.length > 0) {
    beitragRows = await db
      .select()
      .from(memberBeitrags)
      .where(
        and(
          inArray(memberBeitrags.memberId, memberIds),
          eq(memberBeitrags.year, year),
        ),
      );
  }

  const beitragMap = new Map(beitragRows.map((b) => [b.memberId, b]));

  // Determine which members were active in this year.
  const rows: BerichtRow[] = [];
  for (const m of allMembers) {
    const entryYear = m.eintrittsDatum
      ? new Date(m.eintrittsDatum).getFullYear()
      : 0;
    const exitYear = m.austrittsDatum
      ? new Date(m.austrittsDatum).getFullYear()
      : null;

    // Skip members who weren't in the club during this year at all.
    if (entryYear > year) continue;
    if (exitYear !== null && exitYear < year) continue;

    const beitrag = beitragMap.get(m.id);
    const defaultCents = Number(satz?.cents ?? 6969n);

    // Effective exemption: permanent (members.beitrag_exempt) or per-year (member_beitrags.is_exempt).
    const effectiveExempt = m.beitragExempt || (beitrag?.isExempt ?? false);
    const exemptReason = m.beitragExempt
      ? (m.beitragExemptReason ?? null)
      : (beitrag?.exemptReason ?? null);

    let status: BerichtRow["status"];
    if (effectiveExempt) {
      status = "exempt";
    } else if (
      beitrag &&
      Number(beitrag.paidCents) >= Number(beitrag.betragCents)
    ) {
      status = "paid";
    } else {
      status = "open";
    }

    rows.push({
      memberId: m.id,
      name: `${m.nachname}, ${m.vorname}`,
      eintrittsDatum: m.eintrittsDatum ?? null,
      status,
      betragCents: beitrag ? Number(beitrag.betragCents) : defaultCents,
      paidCents: beitrag ? Number(beitrag.paidCents) : 0,
      gezahltAm: beitrag?.gezahltAm ?? null,
      exemptReason,
    });
  }

  // Compute totals.
  const paidRows = rows.filter((r) => r.status === "paid");
  const openRows = rows.filter((r) => r.status === "open");
  const exemptRows = rows.filter((r) => r.status === "exempt");

  const paidSumCents = paidRows.reduce((s, r) => s + r.paidCents, 0);
  const openSumCents = openRows.reduce((s, r) => s + r.betragCents, 0);

  return {
    year,
    faelligkeitAt: satz?.faelligkeitAt ?? null,
    rows,
    totals: {
      memberCount: rows.length,
      paidCount: paidRows.length,
      openCount: openRows.length,
      exemptCount: exemptRows.length,
      paidSumCents,
      openSumCents,
    },
  };
};
