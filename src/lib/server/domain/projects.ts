/**
 * Server-only Projekte domain helpers.
 *
 * - validateAddProject / validateEditProject: Zod schemas + validation
 * - projectFinancials / batchProjectFinancials: aggregate counts + sums
 *   used by the project detail hero and the projekte list saldo pill.
 *
 * ProjectView is the serializable shape returned to the client.
 */

import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "$lib/server/db/index.js";

// ---------------------------------------------------------------------------
// View type (serializable — no Date objects)
// ---------------------------------------------------------------------------

export type ProjectView = {
  id: string;
  businessId: string;
  name: string;
  sphereDefault: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  /** C1-PRJ-A: optional canonical Kunde for /rechnungen/new?projectId=X prefill. */
  defaultCustomerId: string | null;
  isFixture: boolean;
  deletedAt: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

function optionalText(schema: z.ZodString) {
  return z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.union([schema, z.undefined()]));
}

const sphereValues = [
  "ideeller",
  "vermoegen",
  "zweckbetrieb",
  "wirtschaftlich",
] as const;

const projectBaseSchema = z.object({
  name: z
    .string()
    .min(1, "Projektname ist erforderlich")
    .max(200, "Projektname zu lang"),
  sphere_default: z
    .enum(sphereValues)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  start_date: optionalText(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT"),
  ),
  end_date: optionalText(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT"),
  ),
  notes: optionalText(z.string().max(2000, "Notizen zu lang")),
  /** C1-PRJ-A: optional canonical Kunde. Empty string normalises to undefined. */
  default_customer_id: z
    .string()
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v))
    .pipe(z.string().uuid("Ungültige Kunden-ID").optional()),
});

export const addProjectSchema = projectBaseSchema;
export type AddProjectInput = z.infer<typeof addProjectSchema>;

export const editProjectSchema = projectBaseSchema.extend({
  id: z.string().uuid("Ungültige Projekt-ID"),
});
export type EditProjectInput = z.infer<typeof editProjectSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function validateAddProject(
  data: Record<string, unknown>,
):
  | { success: true; data: AddProjectInput }
  | { success: false; errors: Record<string, string[]> } {
  const result = addProjectSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { success: false, errors };
}

export function validateEditProject(
  data: Record<string, unknown>,
):
  | { success: true; data: EditProjectInput }
  | { success: false; errors: Record<string, string[]> } {
  const result = editProjectSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (errors[key] ??= []).push(issue.message);
  }
  return { success: false, errors };
}

// ---------------------------------------------------------------------------
// Projekt-Financials aggregates (C1-PRJ-A)
// ---------------------------------------------------------------------------

export interface ProjectFinancials {
  einnahmenCents: number;
  ausgabenCents: number;
  saldoCents: number;
  offeneRechnungen: number;
  auslagenZuPruefen: number;
  buchungenCount: number;
}

const ZERO_FINANCIALS: ProjectFinancials = {
  einnahmenCents: 0,
  ausgabenCents: 0,
  saldoCents: 0,
  offeneRechnungen: 0,
  auslagenZuPruefen: 0,
  buchungenCount: 0,
};

/**
 * Aggregate financials for a single project.
 *
 * Returns the einnahmen/ausgaben sums + saldo, the number of open invoices
 * (bezahlt_am IS NULL), and the number of expenses in `zu_pruefen` status
 * linked to this project. Used by the /app/projekte/[id] detail hero.
 *
 * Implemented as a thin wrapper over `batchProjectFinancials` so the list
 * view + detail view share a single SQL path.
 */
export async function projectFinancials(
  projectId: string,
): Promise<ProjectFinancials> {
  const map = await batchProjectFinancials([projectId]);
  return map[projectId] ?? { ...ZERO_FINANCIALS };
}

/**
 * Batched aggregate financials for many project ids.
 *
 * Executes exactly two grouped queries (one for income/expense sums, one for
 * invoice + expense counts). N+1-safe — used by the /app/projekte list +
 * dashboard top-Projekte widgets to render saldo pills per row without per-row
 * round-trips.
 *
 * Notes on the SQL:
 * - Neither income/expenses/invoices currently have a `deleted_at` column.
 *   The Festschreibung mixin (festgeschrieben_at, supersedes_id) is the
 *   audit-trail mechanism; superseded rows still count toward project totals
 *   (the new row that supersedes them is the one that gets billed). If/when
 *   soft-delete is added to those tables, fold the filter into the WHERE
 *   clauses here.
 * - `offene_rechnungen` matches `bezahlt_am IS NULL`. `auslagen_zu_pruefen`
 *   matches the `status = 'zu_pruefen'` enum value.
 */
export async function batchProjectFinancials(
  projectIds: string[],
): Promise<Record<string, ProjectFinancials>> {
  const out: Record<string, ProjectFinancials> = {};
  if (projectIds.length === 0) return out;
  const db = getDb();

  // Build a Postgres uuid[] literal so `unnest()` parses each element as a
  // separate UUID. Drizzle/postgres-js sends a JS array as a single text
  // parameter, which Postgres rejects as a malformed array literal for
  // `unnest(<text>::uuid[])` — so we hand-format the {uuid,uuid,...} literal
  // (the values are validated UUIDs upstream, so no SQL-injection risk).
  const idsLiteral = `{${projectIds.join(",")}}`;

  // Query 1: einnahmen + ausgaben sums per project.
  const sums = (await db.execute<{
    project_id: string;
    einnahmen_cents: string;
    ausgaben_cents: string;
  }>(sql`
    WITH ids AS (SELECT unnest(${idsLiteral}::uuid[]) AS pid)
    SELECT
      ids.pid::text AS project_id,
      COALESCE((
        SELECT SUM(betrag_cents) FROM income WHERE project_id = ids.pid
      ), 0)::text AS einnahmen_cents,
      COALESCE((
        SELECT SUM(betrag_cents) FROM expenses WHERE project_id = ids.pid
      ), 0)::text AS ausgaben_cents
    FROM ids
  `)) as Array<{
    project_id: string;
    einnahmen_cents: string;
    ausgaben_cents: string;
  }>;

  // Query 2: counts (offene Rechnungen + Auslagen zu prüfen + Aurora Buchungen).
  const counts = (await db.execute<{
    project_id: string;
    offene_rechnungen: string;
    auslagen_zu_pruefen: string;
    einnahmen_buchungen: string;
    ausgaben_buchungen: string;
  }>(sql`
    WITH ids AS (SELECT unnest(${idsLiteral}::uuid[]) AS pid)
    SELECT
      ids.pid::text AS project_id,
      COALESCE((
        SELECT COUNT(*) FROM invoices
         WHERE project_id = ids.pid AND bezahlt_am IS NULL
      ), 0)::text AS offene_rechnungen,
      COALESCE((
        SELECT COUNT(*) FROM expenses
         WHERE project_id = ids.pid AND status = 'zu_pruefen'
      ), 0)::text AS auslagen_zu_pruefen,
      COALESCE((
        SELECT COUNT(*) FROM income WHERE project_id = ids.pid
      ), 0)::text AS einnahmen_buchungen,
      COALESCE((
        SELECT COUNT(*) FROM expenses WHERE project_id = ids.pid
      ), 0)::text AS ausgaben_buchungen
    FROM ids
  `)) as Array<{
    project_id: string;
    offene_rechnungen: string;
    auslagen_zu_pruefen: string;
    einnahmen_buchungen: string;
    ausgaben_buchungen: string;
  }>;

  const sumMap = new Map(sums.map((r) => [r.project_id, r]));
  const cntMap = new Map(counts.map((r) => [r.project_id, r]));

  for (const id of projectIds) {
    const s = sumMap.get(id);
    const c = cntMap.get(id);
    const einnahmenCents = Number(s?.einnahmen_cents ?? 0);
    const ausgabenCents = Number(s?.ausgaben_cents ?? 0);
    out[id] = {
      einnahmenCents,
      ausgabenCents,
      saldoCents: einnahmenCents - ausgabenCents,
      offeneRechnungen: Number(c?.offene_rechnungen ?? 0),
      auslagenZuPruefen: Number(c?.auslagen_zu_pruefen ?? 0),
      // Aurora: Buchungen-count = income + expense rows — the SAME set that
      // produced saldoCents above, so count and saldo never disagree.
      buchungenCount:
        Number(c?.einnahmen_buchungen ?? 0) +
        Number(c?.ausgaben_buchungen ?? 0),
    };
  }
  return out;
}
