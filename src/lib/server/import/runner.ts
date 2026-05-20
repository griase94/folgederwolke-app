/**
 * Importer runner — orchestrates dry-run + apply for Phase 6 cutover.
 *
 * Public surface:
 *   - `planImport(input)` — resolves lookups, runs `transformLegacySheet`,
 *     does NOT write to the DB. Returns the `TransformResult` plus a
 *     pre-flight festschreibung / idempotency assessment.
 *   - `applyImport(input)` — wraps `planImport`'s output in a single
 *     DB transaction:
 *       1. INSERT import_runs row (status='running'),
 *       2. INSERT expenses / income / donations (ON CONFLICT DO NOTHING by
 *          business_id — second apply is a true no-op for rows already
 *          imported by a previous run with the same idempotency_key),
 *       3. CALL seed_id_counter_from_corpus(year, kind) for each touched
 *          (year, kind),
 *       4. UPDATE import_runs row (status='ok', completedAt, rowCounts).
 *
 * Idempotency key default: `sheet_import_YYYY-MM-DD`. Re-running with the
 * same key + same source-hash is a no-op (returns the previous run id);
 * same key but different hash refuses unless forceReplace=true.
 *
 * Festschreibung gate (ADR-0006): if `transformResult.yearsTouched` contains
 * any year <= `settings.festgeschrieben_bis`, applyImport refuses and the
 * dry-run flags it red so the admin sees it upfront.
 */

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { importRuns } from "$lib/server/db/schema/import_runs.js";
import { income } from "$lib/server/db/schema/income.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { members } from "$lib/server/db/schema/members.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { berlinYear } from "$lib/domain/year.js";
import type { LegacySheet } from "./sheet-reader.js";
import {
  transformLegacySheet,
  type TransformContext,
  type TransformResult,
} from "./transform.js";

// ---------------------------------------------------------------------------
// Public input/output
// ---------------------------------------------------------------------------

export interface PlanImportInput {
  sheet: LegacySheet;
  /** Optional override — default uses today's date in Europe/Berlin. */
  idempotencyKey?: string;
  /** Whether the user passed --force-replace / "Ich weiss was ich tu". */
  forceReplace?: boolean;
}

export interface PlanImportResult {
  idempotencyKey: string;
  sourceHash: string;
  sourceChannel: LegacySheet["source"];
  transform: TransformResult;
  /** Existing business_ids that would be skipped (idempotency / already-imported). */
  duplicatesExisting: {
    expenses: string[];
    income: string[];
    donations: string[];
  };
  /** Already-completed import_runs with the same idempotency key. */
  previousRun: {
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    sourceHash: string;
  } | null;
  /** Years the import would touch which are <= festgeschrieben_bis. */
  festgeschriebenViolations: number[];
  /** Aggregate counts shown in the diff preview. */
  counts: {
    expenses: number;
    income: number;
    donations: number;
    auslagenSubmissions: number;
    errors: number;
    skippedDuplicates: number;
  };
  /** True when applyImport is safe to call without forceReplace. */
  safeToApply: boolean;
}

export interface ApplyImportInput extends PlanImportInput {
  triggeredByUserId: string;
}

export interface ApplyImportResult {
  importRunId: string;
  rowsInserted: {
    expenses: number;
    income: number;
    donations: number;
  };
  errors: TransformResult["errors"];
  /** Years for which seed_id_counter_from_corpus was called. */
  countersSeeded: { year: number; kind: string }[];
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export async function planImport(
  input: PlanImportInput,
): Promise<PlanImportResult> {
  const db = getDb();

  // 1. Load lookups.
  const memberRows = await db
    .select({
      id: members.id,
      vorname: members.vorname,
      nachname: members.nachname,
    })
    .from(members);
  const kategorieRows = await db
    .select({
      id: kategorien.id,
      kind: kategorien.kind,
      name: kategorien.name,
      sphere: kategorien.sphere,
    })
    .from(kategorien);
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects);

  const idempotencyKey =
    input.idempotencyKey ?? `sheet_import_${todayBerlinIso()}`;
  const sourceTag = `${idempotencyKey}@${input.sheet.sourceHash.slice(0, 8)}`;

  const ctx: TransformContext = {
    members: memberRows,
    kategorien: kategorieRows.map((k) => ({
      id: k.id,
      kind: k.kind === "income" ? "income" : "expense",
      name: k.name,
      sphere: k.sphere,
    })),
    projects: projectRows,
    sourceTag,
  };

  // 2. Transform.
  const transform = transformLegacySheet(input.sheet, ctx);

  // 3. Idempotency: which business_ids already exist?
  const dupExpenses = await listExistingExpenseIds(
    transform.expenses.map((r) => r.businessId),
  );
  const dupIncome = await listExistingIncomeIds(
    transform.income.map((r) => r.businessId),
  );
  const dupDonations = await listExistingDonationIds(
    transform.donations.map((r) => r.businessId),
  );

  // 4. Previous import_runs with the same idempotency key.
  const prevRows = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.idempotencyKey, idempotencyKey))
    .limit(1);
  const previousRun = prevRows[0]
    ? {
        id: prevRows[0].id,
        status: prevRows[0].status,
        startedAt: prevRows[0].startedAt.toISOString(),
        completedAt: prevRows[0].completedAt?.toISOString() ?? null,
        sourceHash: prevRows[0].sourceHash,
      }
    : null;

  // 5. Festschreibung gate.
  const festBis = await fetchFestgeschriebenBis();
  const festgeschriebenViolations =
    festBis !== null ? transform.yearsTouched.filter((y) => y <= festBis) : [];

  const skippedDuplicates =
    dupExpenses.length + dupIncome.length + dupDonations.length;

  const blockingPreviousRun =
    previousRun !== null &&
    previousRun.status === "ok" &&
    previousRun.sourceHash === input.sheet.sourceHash &&
    !input.forceReplace;

  const safeToApply =
    transform.errors.length === 0 &&
    festgeschriebenViolations.length === 0 &&
    !blockingPreviousRun;

  return {
    idempotencyKey,
    sourceHash: input.sheet.sourceHash,
    sourceChannel: input.sheet.source,
    transform,
    duplicatesExisting: {
      expenses: dupExpenses,
      income: dupIncome,
      donations: dupDonations,
    },
    previousRun,
    festgeschriebenViolations,
    counts: {
      expenses: transform.expenses.length - dupExpenses.length,
      income: transform.income.length - dupIncome.length,
      donations: transform.donations.length - dupDonations.length,
      auslagenSubmissions: transform.auslagenSubmissions.length,
      errors: transform.errors.length,
      skippedDuplicates,
    },
    safeToApply,
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export async function applyImport(
  input: ApplyImportInput,
): Promise<ApplyImportResult> {
  const plan = await planImport(input);

  if (plan.transform.errors.length > 0 && !input.forceReplace) {
    throw new Error(
      `applyImport: ${plan.transform.errors.length} Validierungsfehler — bitte erst beheben oder forceReplace setzen.`,
    );
  }
  if (plan.festgeschriebenViolations.length > 0) {
    throw new Error(
      `applyImport: Festschreibung verletzt fuer Jahre [${plan.festgeschriebenViolations.join(", ")}].` +
        ` Import wird abgebrochen.`,
    );
  }
  if (
    plan.previousRun !== null &&
    plan.previousRun.status === "ok" &&
    plan.previousRun.sourceHash === input.sheet.sourceHash &&
    !input.forceReplace
  ) {
    throw new Error(
      `applyImport: Import mit Schluessel "${plan.idempotencyKey}" wurde bereits erfolgreich angewendet.` +
        ` Verwende forceReplace oder einen anderen idempotencyKey.`,
    );
  }

  const db = getDb();

  const skipExpenses = new Set(plan.duplicatesExisting.expenses);
  const skipIncome = new Set(plan.duplicatesExisting.income);
  const skipDonations = new Set(plan.duplicatesExisting.donations);

  const expensesToInsert = plan.transform.expenses.filter(
    (r) => !skipExpenses.has(r.businessId),
  );
  const incomeToInsert = plan.transform.income.filter(
    (r) => !skipIncome.has(r.businessId),
  );
  const donationsToInsert = plan.transform.donations.filter(
    (r) => !skipDonations.has(r.businessId),
  );

  const rowCounts = { expenses: 0, income: 0, donations: 0 };
  const countersSeeded: { year: number; kind: string }[] = [];

  const importRunId = await db.transaction(async (tx) => {
    const [runRow] = await tx
      .insert(importRuns)
      .values({
        idempotencyKey: plan.idempotencyKey,
        sourceHash: plan.sourceHash,
        triggeredByUserId: input.triggeredByUserId,
        forceReplaceUsed: input.forceReplace ? 1 : 0,
        status: "running",
        rowCounts: {
          expensesPlanned: expensesToInsert.length,
          incomePlanned: incomeToInsert.length,
          donationsPlanned: donationsToInsert.length,
        },
      })
      .onConflictDoUpdate({
        target: importRuns.idempotencyKey,
        set: {
          sourceHash: plan.sourceHash,
          startedAt: new Date(),
          completedAt: null,
          status: "running",
          forceReplaceUsed: input.forceReplace ? 1 : 0,
          errorMessage: null,
        },
      })
      .returning({ id: importRuns.id });

    if (!runRow) {
      throw new Error("applyImport: import_runs upsert returned no row");
    }
    const runId = runRow.id;

    if (expensesToInsert.length > 0) {
      const res = await tx
        .insert(expenses)
        .values(expensesToInsert)
        .onConflictDoNothing({ target: expenses.businessId })
        .returning({ businessId: expenses.businessId });
      rowCounts.expenses = res.length;
    }
    if (incomeToInsert.length > 0) {
      const res = await tx
        .insert(income)
        .values(incomeToInsert)
        .onConflictDoNothing({ target: income.businessId })
        .returning({ businessId: income.businessId });
      rowCounts.income = res.length;
    }
    if (donationsToInsert.length > 0) {
      const res = await tx
        .insert(donations)
        .values(donationsToInsert)
        .onConflictDoNothing({ target: donations.businessId })
        .returning({ businessId: donations.businessId });
      rowCounts.donations = res.length;
    }

    const seedKeys = new Set<string>();
    for (const r of expensesToInsert) {
      seedKeys.add(`${parseYear(r.businessId)}:A`);
    }
    for (const r of incomeToInsert) {
      seedKeys.add(`${parseYear(r.businessId)}:E`);
    }
    for (const r of donationsToInsert) {
      seedKeys.add(`${parseYear(r.businessId)}:S`);
      if (r.bescheinigungNr) {
        seedKeys.add(`${parseYear(r.businessId)}:B`);
      }
    }
    for (const key of seedKeys) {
      const [yearStr, kind] = key.split(":");
      const year = parseInt(yearStr!, 10);
      if (!Number.isFinite(year) || !kind) continue;
      await tx.execute(
        sql`SELECT seed_id_counter_from_corpus(${year}, ${kind})`,
      );
      countersSeeded.push({ year, kind });
    }

    await tx
      .update(importRuns)
      .set({
        status: "ok",
        completedAt: new Date(),
        rowCounts: {
          expenses: rowCounts.expenses,
          income: rowCounts.income,
          donations: rowCounts.donations,
          countersSeeded: countersSeeded.length,
        },
      })
      .where(eq(importRuns.id, runId));

    return runId;
  });

  return {
    importRunId,
    rowsInserted: rowCounts,
    errors: plan.transform.errors,
    countersSeeded,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function listExistingExpenseIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ businessId: expenses.businessId })
    .from(expenses)
    .where(inArray(expenses.businessId, ids));
  return rows.map((r) => r.businessId);
}

async function listExistingIncomeIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ businessId: income.businessId })
    .from(income)
    .where(inArray(income.businessId, ids));
  return rows.map((r) => r.businessId);
}

async function listExistingDonationIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ businessId: donations.businessId })
    .from(donations)
    .where(inArray(donations.businessId, ids));
  return rows.map((r) => r.businessId);
}

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

function parseYear(businessId: string): number {
  const m = /^[A-Z]+-(\d{4})-/.exec(businessId);
  return m ? parseInt(m[1]!, 10) : berlinYear();
}

function todayBerlinIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Re-export to silence the unused-import warning that drizzle queries cause
// when we don't reference `auslagenSubmissions` directly. Future work may use it.
export { auslagenSubmissions as _auslagenSubmissionsSchema };
