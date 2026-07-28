/**
 * /auslage-eingereicht — public batch submission receipt.
 *
 * The confirmation now resolves the submitted row (and its group siblings) so
 * it can render the AUS-Nr(s), the plum amount(s) and an absolute submit date —
 * previously the page was client-only and rendered blind (a bug: a missing/
 * unknown ?id= showed a fake success). Any AUS-Nr of a batch opens the whole
 * group here (single = a group of one — ONE render path).
 *
 * PUBLIC-SAFE payload: AUS-Nr, bezeichnung, cents, submit date, first name.
 * NEVER the IBAN or e-mail (the page is "tokenised" by the AUS-Nr, like the
 * status page). Rate-limited to blunt enumeration.
 */

import { error } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { parseBusinessId } from "$lib/domain/business-id.js";
import { checkAndRecord, RateLimitError } from "$lib/server/auth/rate-limit.js";

function firstName(row: {
  externName: string | null;
  bezahltVonDisplay: string;
}): string {
  // Public arm: the submitter is extern, so extern_name is the source. Fall back
  // to the display snapshot's first token; never leak more than a first name.
  const base = row.externName ?? row.bezahltVonDisplay ?? "";
  const stripped = base.replace(/^(Mitglied|Extern):\s*/i, "");
  return stripped.split(/\s+/)[0] ?? "";
}

export const load: PageServerLoad = async ({ url, getClientAddress }) => {
  const rawId = url.searchParams.get("id") ?? "";
  const parsed = parseBusinessId(rawId);
  if (!parsed || parsed.prefix !== "AUS") {
    throw error(404, "Keine Einreichung mit dieser Nummer.");
  }

  // Rate limit: 20 lookups / min / IP-prefix (same mechanism as the status page).
  const ip = getClientAddress();
  const ipKey = ip.includes(":")
    ? (ip.split(":")[0] ?? ip.slice(0, 8))
    : ip.split(".").slice(0, 2).join(".");
  try {
    await checkAndRecord(`auslage:eingereicht:${ipKey}`, 20, 60 * 1000);
  } catch (err) {
    if (err instanceof RateLimitError) {
      throw error(429, "Zu viele Anfragen — bitte einen Moment warten.");
    }
    throw err;
  }

  const db = getDb();
  const row = await db.query.auslagenSubmissions.findFirst({
    where: eq(auslagenSubmissions.businessId, rawId),
    columns: {
      businessId: true,
      bezeichnung: true,
      betragCents: true,
      submittedAt: true,
      submissionGroupId: true,
      externName: true,
      bezahltVonDisplay: true,
      belegFileId: true,
      belegOriginalName: true,
    },
  });
  if (!row) {
    throw error(404, "Keine Einreichung mit dieser Nummer.");
  }

  // Group siblings (batch). Single submits (or NULL group) render as n=1.
  const groupRows = row.submissionGroupId
    ? await db.query.auslagenSubmissions.findMany({
        where: eq(auslagenSubmissions.submissionGroupId, row.submissionGroupId),
        orderBy: (t, { asc }) => [asc(t.businessId)],
        columns: {
          businessId: true,
          bezeichnung: true,
          betragCents: true,
          belegFileId: true,
        },
      })
    : [
        {
          businessId: row.businessId,
          bezeichnung: row.bezeichnung,
          betragCents: row.betragCents,
          belegFileId: row.belegFileId,
        },
      ];

  const items = groupRows.map((r) => ({
    ausId: r.businessId,
    bezeichnung: r.bezeichnung,
    betragCents: Number(r.betragCents),
    belegOk: r.belegFileId != null,
  }));
  const gesamtCents = items.reduce((s, i) => s + i.betragCents, 0);
  const firstAus = items[0]?.ausId ?? row.businessId;

  return {
    vorname: firstName(row),
    items,
    gesamtCents,
    belegName: row.belegOriginalName,
    submittedAt: row.submittedAt.toISOString(),
    statusUrl: `/auslage-status/${firstAus}`,
  };
};
