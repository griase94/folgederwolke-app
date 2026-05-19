/**
 * /app/sheet-resync — legacy Google Sheet importer UI (Phase 6).
 *
 * load(): returns recent import_runs for the run history table and whether
 *         the SA path is available (used to show the SA vs CSV hint in the UI).
 *
 * actions:
 *   ?/dry-run  — parse uploaded CSV file(s), run planImport, return preview
 *   ?/apply    — run applyImport (idempotent via import_runs key)
 */

import { fail } from "@sveltejs/kit";
import { desc } from "drizzle-orm";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { importRuns } from "$lib/server/db/schema/import_runs.js";
import {
  checkServiceAccountAvailability,
  readViaCsvUpload,
  type UploadedCsv,
} from "$lib/server/import/sheet-reader.js";
import {
  planImport,
  applyImport,
  type PlanImportResult,
} from "$lib/server/import/runner.js";

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async () => {
  const db = getDb();

  const [recentRuns, saAvailability] = await Promise.all([
    db
      .select({
        id: importRuns.id,
        idempotencyKey: importRuns.idempotencyKey,
        sourceHash: importRuns.sourceHash,
        startedAt: importRuns.startedAt,
        completedAt: importRuns.completedAt,
        status: importRuns.status,
        rowCounts: importRuns.rowCounts,
        errorMessage: importRuns.errorMessage,
        forceReplaceUsed: importRuns.forceReplaceUsed,
      })
      .from(importRuns)
      .orderBy(desc(importRuns.startedAt))
      .limit(10),
    checkServiceAccountAvailability(),
  ]);

  return {
    recentRuns: recentRuns.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
    saAvailable: saAvailability.available,
    saReason: saAvailability.reason,
  };
};

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w_-]+$/)
  .optional();

/**
 * Serialize PlanImportResult for JSON transport — BigInt fields are converted
 * to strings so SvelteKit's form action serializer doesn't choke.
 */
function serializePlan(plan: PlanImportResult) {
  return {
    idempotencyKey: plan.idempotencyKey,
    sourceHash: plan.sourceHash,
    sourceChannel: plan.sourceChannel,
    previousRun: plan.previousRun,
    festgeschriebenViolations: plan.festgeschriebenViolations,
    counts: plan.counts,
    safeToApply: plan.safeToApply,
    errors: plan.transform.errors,
    // Expense / income / donation previews — only first 20 for the diff UI.
    previewExpenses: plan.transform.expenses.slice(0, 20).map((r) => ({
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: r.betragCents.toString(),
      gebuchtAm: r.gebuchtAm.toISOString(),
      sphereSnapshot: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      sourceRef: r.sourceRef,
    })),
    previewIncome: plan.transform.income.slice(0, 20).map((r) => ({
      businessId: r.businessId,
      bezeichnung: r.bezeichnung,
      betragCents: r.betragCents.toString(),
      gebuchtAm: r.gebuchtAm.toISOString(),
      sphereSnapshot: r.sphereSnapshot,
      kategorieNameSnapshot: r.kategorieNameSnapshot,
      sourceRef: r.sourceRef,
    })),
    previewDonations: plan.transform.donations.slice(0, 20).map((r) => ({
      businessId: r.businessId,
      spenderName: r.spenderName,
      betragCents: r.betragCents.toString(),
      gebuchtAm: r.gebuchtAm.toISOString(),
      sphereSnapshot: r.sphereSnapshot,
      sourceRef: r.sourceRef,
    })),
    duplicatesExisting: plan.duplicatesExisting,
    yearsTouched: plan.transform.yearsTouched,
  };
}

export const actions = {
  "dry-run": async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const rawKey = idempotencyKeySchema.safeParse(
      data.get("idempotencyKey") ?? undefined,
    );
    if (!rawKey.success) {
      return fail(422, { error: "Ungültiger Idempotenz-Schlüssel" });
    }

    // Collect uploaded CSV files from formData.
    const uploads: UploadedCsv[] = [];
    for (const [key, value] of data.entries()) {
      if (!(value instanceof File) || value.size === 0) continue;
      if (!key.startsWith("csv_")) continue;
      const text = await value.text();
      uploads.push({ filename: value.name, text });
    }

    if (uploads.length === 0) {
      return fail(422, {
        error:
          "Keine CSV-Dateien hochgeladen. Mindestens eine Datei (Ausgaben, Einnahmen oder Spenden) erforderlich.",
      });
    }

    let sheet;
    try {
      sheet = readViaCsvUpload(uploads);
    } catch (err) {
      return fail(422, { error: (err as Error).message });
    }

    let plan;
    try {
      plan = await planImport({
        sheet,
        idempotencyKey: rawKey.data,
      });
    } catch (err) {
      return fail(500, { error: (err as Error).message });
    }

    return { ok: true, plan: serializePlan(plan) };
  },

  apply: async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const rawKey = idempotencyKeySchema.safeParse(
      data.get("idempotencyKey") ?? undefined,
    );
    if (!rawKey.success) {
      return fail(422, { error: "Ungültiger Idempotenz-Schlüssel" });
    }
    const forceReplace = data.get("forceReplace") === "true";

    const uploads: UploadedCsv[] = [];
    for (const [key, value] of data.entries()) {
      if (!(value instanceof File) || value.size === 0) continue;
      if (!key.startsWith("csv_")) continue;
      const text = await value.text();
      uploads.push({ filename: value.name, text });
    }

    if (uploads.length === 0) {
      return fail(422, { error: "Keine CSV-Dateien hochgeladen." });
    }

    let sheet;
    try {
      sheet = readViaCsvUpload(uploads);
    } catch (err) {
      return fail(422, { error: (err as Error).message });
    }

    let result;
    try {
      result = await applyImport({
        sheet,
        idempotencyKey: rawKey.data,
        forceReplace,
        triggeredByUserId: user.id,
      });
    } catch (err) {
      return fail(409, { error: (err as Error).message });
    }

    return {
      ok: true,
      importRunId: result.importRunId,
      rowsInserted: result.rowsInserted,
      errors: result.errors,
      countersSeeded: result.countersSeeded,
    };
  },
} satisfies Actions;
