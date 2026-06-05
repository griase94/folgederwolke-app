/**
 * Picker helpers for the transaction-neu routes (cluster C4).
 * Phase 8 T6: /app/transactions/neu retired; used by per-tab neu routes.
 *
 * Fixes findings VB-004 + JB-014: the form used to hardcode
 * sphereSnapshot="ideeller" + kategorieNameSnapshot="(Unkategorisiert)",
 * which broke EÜR sphere aggregation. This module replaces both with
 * real-data-driven pickers:
 *
 *  - listKategorieOptions(kind)       → the dropdown source
 *  - resolveSphereForKategorie(…)     → pure: kategorie → sphere (with
 *                                       ADR-0008 project override)
 *  - loadRecentKategorieUsage(userId) → last-N kategorie selections by
 *                                       this user, keyed by (kind, projectId)
 *  - pickDefaultKategorieName(…)      → pure: picks the smart default
 *                                       (last-used > sortOrder fallback)
 *
 * The pure helpers are fully unit-tested; the DB helpers are thin SELECTs
 * covered by PR-time integration testing.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { members } from "$lib/server/db/schema/members.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SphereValue =
  | "ideeller"
  | "vermoegen"
  | "zweckbetrieb"
  | "wirtschaftlich";

export type TransactionKind = "expense" | "income";

export interface KategorieOption {
  id: string;
  kind: TransactionKind | string;
  name: string;
  sphere: SphereValue;
  sortOrder: number;
  deactivated: boolean;
}

export interface RecentKategorieUse {
  kategorieName: string;
  kind: TransactionKind | string;
  projectId: string | null;
  usedAt: Date;
}

// ---------------------------------------------------------------------------
// resolveSphereForKategorie — pure
// ---------------------------------------------------------------------------

/**
 * Derives the sphere for a new booking from the picked Kategorie name.
 *
 * Per ADR-0002 every income/expense row carries an explicit sphere snapshot;
 * per ADR-0008 a Projekt can override the kategorie-default sphere. Order
 * of resolution:
 *   1. If projectSphereOverride is set → use it (ADR-0008).
 *   2. Else look up the matching kategorie by name → its sphere.
 *   3. Else (unknown name — should be impossible if validator works) →
 *      fall back to "ideeller" defensively. The server-side schema must
 *      reject unknown names so this branch never ships a bad row.
 */
export function resolveSphereForKategorie(args: {
  kategorien: readonly KategorieOption[];
  kategorieName: string;
  projectSphereOverride: SphereValue | null;
}): SphereValue {
  if (args.projectSphereOverride) return args.projectSphereOverride;
  const match = args.kategorien.find((k) => k.name === args.kategorieName);
  if (match) return match.sphere;
  return "ideeller";
}

// ---------------------------------------------------------------------------
// pickDefaultKategorieName — pure
// ---------------------------------------------------------------------------

/**
 * Smart default for the Kategorie dropdown:
 *   1. Most recent Kategorie used by this user for the same (kind, projectId).
 *   2. Else first non-deactivated kategorie of `kind` by sortOrder.
 *   3. Else null (caller renders an error — no kategorien seeded).
 *
 * Never returns the legacy "(Unkategorisiert)" placeholder.
 */
export function pickDefaultKategorieName(args: {
  kategorien: readonly KategorieOption[];
  recent: readonly RecentKategorieUse[];
  projectId: string | null;
  kind: TransactionKind | string;
}): string | null {
  // Filter recent uses to matching scope, descending by usedAt.
  const scoped = args.recent
    .filter((r) => r.kind === args.kind && r.projectId === args.projectId)
    .slice()
    .sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime());

  // Validate the recent pick still exists + isn't deactivated.
  for (const r of scoped) {
    const live = args.kategorien.find(
      (k) => k.name === r.kategorieName && k.kind === args.kind,
    );
    if (live && !live.deactivated) return live.name;
  }

  // Fallback: first non-deactivated by sortOrder.
  const fallback = args.kategorien
    .filter((k) => k.kind === args.kind && !k.deactivated)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];

  return fallback ? fallback.name : null;
}

// ---------------------------------------------------------------------------
// listKategorieOptions — DB helper
// ---------------------------------------------------------------------------

/**
 * Loads all non-deactivated kategorien of a given kind, ordered by sortOrder.
 * Drives the picker dropdowns in the per-tab neu routes.
 */
export async function listKategorieOptions(
  kind: TransactionKind,
): Promise<KategorieOption[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: kategorien.id,
      kind: kategorien.kind,
      name: kategorien.name,
      sphere: kategorien.sphere,
      sortOrder: kategorien.sortOrder,
      deactivated: kategorien.deactivated,
    })
    .from(kategorien)
    .where(and(eq(kategorien.kind, kind), eq(kategorien.deactivated, false)))
    .orderBy(kategorien.sortOrder, kategorien.name);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    sphere: r.sphere as SphereValue,
    sortOrder: r.sortOrder,
    deactivated: r.deactivated,
  }));
}

// ---------------------------------------------------------------------------
// loadRecentKategorieUsage — DB helper
// ---------------------------------------------------------------------------

/**
 * Returns this user's recent Kategorie selections grouped by (kind, projectId).
 * Used by pickDefaultKategorieName to do smart pre-selection.
 *
 * We pull the most recent 30 rows per kind — enough to find a match for the
 * project the user is currently working on, without blowing up memory.
 */
export async function loadRecentKategorieUsage(
  userId: string,
): Promise<RecentKategorieUse[]> {
  const db = getDb();

  const expenseRows = await db
    .select({
      kategorieName: expenses.kategorieNameSnapshot,
      projectId: expenses.projectId,
      usedAt: expenses.createdAt,
    })
    .from(expenses)
    .where(eq(expenses.createdByUserId, userId))
    .orderBy(desc(expenses.createdAt))
    .limit(30);

  const incomeRows = await db
    .select({
      kategorieName: income.kategorieNameSnapshot,
      projectId: income.projectId,
      usedAt: income.createdAt,
    })
    .from(income)
    .where(eq(income.createdByUserId, userId))
    .orderBy(desc(income.createdAt))
    .limit(30);

  const out: RecentKategorieUse[] = [];
  for (const r of expenseRows) {
    out.push({
      kategorieName: r.kategorieName,
      kind: "expense",
      projectId: r.projectId,
      usedAt: r.usedAt,
    });
  }
  for (const r of incomeRows) {
    out.push({
      kategorieName: r.kategorieName,
      kind: "income",
      projectId: r.projectId,
      usedAt: r.usedAt,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// listMemberOptions — DB helper
// ---------------------------------------------------------------------------

export interface MemberOption {
  id: string;
  label: string;
}

/**
 * Loads all members as picker options for the member-picker filter fields
 * (spender / bezahlt-von). Returns full names, sorted by nachname then vorname.
 */
export async function listMemberOptions(): Promise<MemberOption[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: members.id,
      vorname: members.vorname,
      nachname: members.nachname,
    })
    .from(members)
    .orderBy(members.nachname, members.vorname);
  return rows.map((m) => ({
    id: m.id,
    label: `${m.vorname} ${m.nachname}`.trim(),
  }));
}

// (avoid unused-import lint when ts checks isNull above for future filters)
void isNull;
