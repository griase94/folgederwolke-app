/**
 * /app/einstellungen/beitraege — per-year Beitragssatz management (Task 2.9 / spec §8).
 *
 * load()   → all rates (desc by year) + festgeschriebenBis + active-member count
 *            (for the preview-impact panel) + recent audit rows.
 * actions:
 *   ?/set-rate — upsert a year's rate (admin-only, festschr.-gated).
 */

import { fail } from "@sveltejs/kit";
import { desc, sql, eq, and, or, isNull, lte, gte } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { members } from "$lib/server/db/schema/members.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { setBeitragssatz } from "$lib/server/domain/beitragssatz-actions.js";
import { berlinYear } from "$lib/domain/year.js";
import { parseEuroToCents } from "$lib/domain/money.js";

async function fetchFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Count active members (joined, not yet ausgetreten) as of today. */
async function activeMemberCount(): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(members)
    .where(
      and(
        or(
          isNull(members.eintrittsDatum),
          lte(members.eintrittsDatum, sql`current_date`),
        ),
        or(
          isNull(members.austrittsDatum),
          gte(members.austrittsDatum, sql`current_date`),
        ),
        sql`${members.beitragExempt} = false`,
      ),
    );
  return rows[0]?.c ?? 0;
}

export const load: PageServerLoad = async () => {
  const db = getDb();
  const currentYear = berlinYear();

  const [rates, festgeschriebenBis, activeCount] = await Promise.all([
    db.select().from(beitragssatzByYear).orderBy(desc(beitragssatzByYear.year)),
    fetchFestgeschriebenBis(),
    activeMemberCount(),
  ]);

  // Recent audit rows for Beitragssatz changes. The handler writes
  // entityKind='settings', payload.kind='beitragssatz_changed'. We filter the
  // payload.kind in JS to avoid a raw jsonb operator in the query builder.
  const settingsAudit = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.entityKind, "settings"))
    .orderBy(desc(auditLog.occurredAt))
    .limit(50);
  const auditRows = settingsAudit
    .filter(
      (a) =>
        (a.payload as Record<string, unknown> | null)?.["kind"] ===
        "beitragssatz_changed",
    )
    .slice(0, 20);

  return {
    currentYear,
    festgeschriebenBis,
    activeMemberCount: activeCount,
    rates: rates.map((r) => ({
      year: r.year,
      cents: Number(r.cents),
      faelligkeitAt: r.faelligkeitAt,
      decisionNote: r.decisionNote,
      isLocked: festgeschriebenBis !== null && r.year <= festgeschriebenBis,
    })),
    audit: auditRows.map((a) => ({
      id: a.id,
      occurredAt: a.occurredAt.toISOString(),
      payload: a.payload as Record<string, unknown> | null,
    })),
  };
};

export const actions: Actions = {
  "set-rate": async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const userRole = locals.session?.user.role ?? null;
    const fd = await request.formData();

    const year = parseInt(fd.get("year")?.toString() ?? "", 10);
    // "create" (new-rate form) vs "update" (inline edit of an existing year).
    // Only "create" must guard against silently clobbering an existing satz;
    // "update" is the deliberate edit path and is allowed to overwrite.
    const mode = fd.get("mode")?.toString() === "update" ? "update" : "create";
    // Betrag arrives as a euro string (e.g. "80,00" or "1.234,56"). The
    // Beitragssatz is the most amount-multiplied value in the app (every member
    // × every year), and the server trusts raw form data — so route it through
    // the canonical de-DE/English parser, not the old replace(",",".")+Number()
    // which mis-parsed German thousands on a crafted/pasted POST (F30 class).
    const betragRaw = fd.get("betrag")?.toString() ?? "";
    const faelligkeitAt = fd.get("faelligkeitAt")?.toString() || null;
    const decisionNote = fd.get("decisionNote")?.toString() || null;

    if (!Number.isFinite(year)) {
      return fail(400, { action: "set-rate", error: "Ungültiges Jahr" });
    }
    let cents: bigint;
    try {
      cents = parseEuroToCents(betragRaw);
    } catch {
      return fail(400, { action: "set-rate", error: "Ungültiger Betrag" });
    }
    if (cents < 0n) {
      return fail(400, { action: "set-rate", error: "Ungültiger Betrag" });
    }

    // Guard against silent overwrite: when adding a *new* rate, refuse if a
    // satz for that year already exists. The admin must use the inline-edit
    // path (mode=update) to change an existing rate.
    if (mode === "create") {
      const db = getDb();
      const [existing] = await db
        .select({ year: beitragssatzByYear.year })
        .from(beitragssatzByYear)
        .where(eq(beitragssatzByYear.year, year))
        .limit(1);
      if (existing) {
        return fail(409, {
          action: "set-rate",
          error: `Für ${year} existiert bereits ein Satz — bitte den bestehenden Eintrag bearbeiten.`,
        });
      }
    }

    const result = await setBeitragssatz({
      year,
      cents,
      faelligkeitAt,
      decisionNote,
      actorUserId: userId,
      actorRole: userRole,
    });

    if (!result.ok) {
      return fail(result.status, { action: "set-rate", error: result.error });
    }
    return { action: "set-rate", success: true };
  },
};
