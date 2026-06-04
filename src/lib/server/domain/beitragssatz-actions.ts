/**
 * Beitragssatz mutation actions (Task 2.9).
 *
 * setBeitragssatz upserts a per-year membership-fee rate. Admin-only
 * (ADR-0009), festschreibung-gated (ADR-0006), emits
 * settings.beitragssatz_changed for the audit log (ADR-0004).
 *
 * Money stays bigint cents in the DB; the audit payload converts to number
 * (JSON-safe — P0-F1).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { beitragssatzByYear } from "$lib/server/db/schema/beitragssatz.js";
import { bus } from "$lib/server/events/index.js";
import { requireAdmin } from "$lib/server/domain/require-role.js";

export type SetBeitragssatzResult =
  | { ok: true }
  | { ok: false; status: number; error?: string };

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

export async function setBeitragssatz(args: {
  year: number;
  cents: bigint;
  faelligkeitAt?: string | null;
  decisionNote?: string | null;
  actorUserId: string | null;
  actorRole?: string | null;
}): Promise<SetBeitragssatzResult> {
  const { year, cents, faelligkeitAt, decisionNote, actorUserId, actorRole } =
    args;

  // ADR-0009: admin-only.
  const denial = requireAdmin(actorRole);
  if (denial) return denial;

  if (!Number.isFinite(year) || year < 2000 || year > 2200) {
    return { ok: false, status: 400, error: "Ungültiges Jahr" };
  }
  if (cents < 0n) {
    return { ok: false, status: 400, error: "Betrag darf nicht negativ sein" };
  }

  // ADR-0006: reject festgeschriebene Jahre.
  const festgeschriebenBis = await fetchFestgeschriebenBis();
  if (festgeschriebenBis !== null && year <= festgeschriebenBis) {
    return { ok: false, status: 409, error: "Jahr ist festgeschrieben" };
  }

  const db = getDb();

  const [prev] = await db
    .select({ cents: beitragssatzByYear.cents })
    .from(beitragssatzByYear)
    .where(eq(beitragssatzByYear.year, year))
    .limit(1);

  await db
    .insert(beitragssatzByYear)
    .values({
      year,
      cents,
      faelligkeitAt: faelligkeitAt ?? null,
      decisionNote: decisionNote ?? null,
      decidedByUserId: actorUserId,
    })
    .onConflictDoUpdate({
      target: [beitragssatzByYear.year],
      set: {
        cents,
        faelligkeitAt: faelligkeitAt ?? null,
        decisionNote: decisionNote ?? null,
        decidedByUserId: actorUserId,
        decidedAt: sql`now()`,
        updatedAt: sql`now()`,
      },
    });

  await bus.emit("settings.beitragssatz_changed", {
    year,
    oldCents: prev ? Number(prev.cents) : null,
    newCents: Number(cents),
    decisionNote: decisionNote ?? null,
    actorUserId,
  });

  return { ok: true };
}
