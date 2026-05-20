/**
 * /app/jahresabschluss/[year]/spenden — year-scoped Spenden list with
 * Bescheinigungs-Status column.
 */

import { error } from "@sveltejs/kit";
import { desc, eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { members } from "$lib/server/db/schema/members.js";
import { isBescheinigungEnabled } from "$lib/server/domain/spenden.js";
import { bescheinigungStatusFor } from "$lib/domain/bescheinigungs-status.js";

export const load: PageServerLoad = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const db = getDb();

  const rawRows = await db
    .select({
      id: donations.id,
      businessId: donations.businessId,
      gebuchtAm: donations.gebuchtAm,
      zugewendetAm: donations.zugewendetAm,
      betragCents: donations.betragCents,
      memberId: donations.memberId,
      spenderName: donations.spenderName,
      spendeKind: donations.spendeKind,
      bescheinigungNr: donations.bescheinigungNr,
      bescheinigungAusgestelltAm: donations.bescheinigungAusgestelltAm,
      kategorieNameSnapshot: donations.kategorieNameSnapshot,
      sphereSnapshot: donations.sphereSnapshot,
      memberVorname: members.vorname,
      memberNachname: members.nachname,
    })
    .from(donations)
    .leftJoin(members, eq(members.id, donations.memberId))
    .where(eq(donations.yearOfBuchung, year))
    .orderBy(desc(donations.gebuchtAm));

  const rows = rawRows.map((r) => ({
    id: r.id,
    businessId: r.businessId,
    gebuchtAm:
      r.gebuchtAm instanceof Date
        ? r.gebuchtAm.toISOString()
        : String(r.gebuchtAm),
    zugewendetAm: r.zugewendetAm,
    betragCents: Number(r.betragCents),
    memberId: r.memberId,
    spenderName: r.spenderName,
    spenderDisplay:
      r.memberVorname && r.memberNachname
        ? `${r.memberVorname} ${r.memberNachname}`
        : (r.spenderName ?? "Anonyme Spende"),
    spendeKind: r.spendeKind,
    bescheinigungNr: r.bescheinigungNr,
    bescheinigungAusgestelltAm:
      r.bescheinigungAusgestelltAm === null
        ? null
        : String(r.bescheinigungAusgestelltAm),
    sphereSnapshot: r.sphereSnapshot,
    kategorieNameSnapshot: r.kategorieNameSnapshot,
    status: bescheinigungStatusFor({
      id: r.id,
      bescheinigungNr: r.bescheinigungNr,
      bescheinigungAusgestelltAm:
        r.bescheinigungAusgestelltAm === null
          ? null
          : String(r.bescheinigungAusgestelltAm),
      betragCents: Number(r.betragCents),
      memberId: r.memberId,
      spenderName: r.spenderName,
      spendeKind: r.spendeKind,
    }),
  }));

  const totals = {
    count: rows.length,
    issued: rows.filter((r) => r.status === "issued").length,
    pending: rows.filter((r) => r.status === "pending").length,
    na: rows.filter((r) => r.status === "na").length,
    totalCents: rows.reduce((acc, r) => acc + r.betragCents, 0),
  };

  return {
    rows,
    totals,
    bescheinigungEnabled: isBescheinigungEnabled(),
  };
};
