/**
 * Phase 9 Task 14 — /app/files browse view (admin-only).
 *
 * Lists active files with year filter + per-row owner resolution. Owners are
 * joined from the four `*_file_id` FK columns (expenses, income, donations,
 * auslagen_submissions) — donations carry two file slots (Beleg +
 * Bescheinigung), the rest carry one each.
 *
 * Authorization: hooks.server.ts already redirects unauthenticated requests.
 * /app/* is only reachable by admin/steuerberater per resolveSession, so we
 * don't need a per-route role check.
 *
 * Driver note: drizzle-orm/postgres-js `db.execute(sql\`…\`)` returns rows as
 * a flat array (not `{rows}`). See tests/integration/files-upload.test.ts.
 */
import type { PageServerLoad, Actions } from "./$types.js";
import { redirect, fail } from "@sveltejs/kit";
import { getDb } from "$lib/server/db/index.js";
import { files } from "$lib/server/db/schema/files.js";
import { eq, sql } from "drizzle-orm";
import { logAudit } from "$lib/server/audit-log/index.js";

/**
 * Read `settings.festgeschrieben_bis` (JSONB). Returns null when unset.
 * Mirrors the helpers in members-actions / audit-inbox-actions — kept local
 * so the files route doesn't pull in unrelated domain code.
 */
async function fetchFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = (await db.execute(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  )) as unknown as Array<{ value: unknown }>;
  const row = rows[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const PAGE_SIZE = 50;

interface FileRow {
  id: string;
  storage_key: string;
  mime_type: string;
  byte_size: string | number;
  original_filename: string;
  kind: string;
  thumbnail_storage_key: string | null;
  uploaded_at: string;
  year_of_buchung: number | null;
  owner_business_id: string | null;
  owner_kind:
    | "expense"
    | "income"
    | "donation"
    | "auslagen_submission"
    | "orphan";
}

export const load: PageServerLoad = async ({ url, locals }) => {
  if (!locals.session?.user) throw redirect(302, "/anmelden");

  const yearParam = url.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : null;
  const page = Math.max(
    0,
    parseInt(url.searchParams.get("page") ?? "0", 10) || 0,
  );
  const offset = page * PAGE_SIZE;

  const db = getDb();

  // Distinct buchungs-years for the dropdown
  const yearsRes = (await db.execute(sql`
    SELECT DISTINCT year_of_buchung AS year
    FROM files
    WHERE deleted_at IS NULL AND year_of_buchung IS NOT NULL
    ORDER BY year DESC
  `)) as unknown as Array<{ year: number }>;
  const years = yearsRes.map((r) => r.year);

  const yearFilter = year ? sql`AND f.year_of_buchung = ${year}` : sql``;

  const rowsRes = (await db.execute(sql`
    SELECT
      f.id, f.storage_key, f.mime_type, f.byte_size, f.original_filename,
      f.kind, f.thumbnail_storage_key, f.uploaded_at, f.year_of_buchung,
      COALESCE(e.business_id, i.business_id, d.business_id, s.business_id) AS owner_business_id,
      CASE
        WHEN e.id IS NOT NULL THEN 'expense'
        WHEN i.id IS NOT NULL THEN 'income'
        WHEN d.id IS NOT NULL THEN 'donation'
        WHEN s.id IS NOT NULL THEN 'auslagen_submission'
        ELSE 'orphan'
      END AS owner_kind
    FROM files f
    LEFT JOIN expenses              e ON e.beleg_file_id = f.id
    LEFT JOIN income                i ON i.beleg_file_id = f.id
    LEFT JOIN donations             d ON d.beleg_file_id = f.id OR d.bescheinigung_file_id = f.id
    LEFT JOIN auslagen_submissions  s ON s.beleg_file_id = f.id
    WHERE f.deleted_at IS NULL
      ${yearFilter}
    ORDER BY f.uploaded_at DESC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `)) as unknown as FileRow[];

  const yearFilterCount = year ? sql`AND year_of_buchung = ${year}` : sql``;
  const countRes = (await db.execute(sql`
    SELECT count(*)::int AS c FROM files
    WHERE deleted_at IS NULL
      ${yearFilterCount}
  `)) as unknown as Array<{ c: number }>;
  const total = countRes[0]?.c ?? 0;

  return {
    years,
    rows: rowsRes,
    year,
    page,
    pageSize: PAGE_SIZE,
    total,
  };
};

export const actions: Actions = {
  softDelete: async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Not authenticated" });
    const fd = await request.formData();
    const fileId = fd.get("fileId")?.toString();
    if (!fileId) return fail(400, { error: "Missing fileId" });

    const db = getDb();

    // L2 Festschreibung pre-check (ADR-0012 §L2): friendly German error
    // before the L3 DB trigger surfaces a raw Postgres exception.
    const file = await db.query.files.findFirst({
      where: eq(files.id, fileId),
    });
    if (!file) return fail(404, { error: "Datei nicht gefunden" });
    const fileYear = file.yearOfBuchung;
    const festYear = await fetchFestgeschriebenBis();
    if (fileYear !== null && festYear !== null && fileYear <= festYear) {
      return fail(409, {
        error: "Buchungsjahr ist festgeschrieben – Löschen nicht möglich.",
      });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(files)
        .set({ deletedAt: new Date(), deleteReason: "user_request" })
        .where(eq(files.id, fileId));
      await logAudit(
        {
          action: "delete",
          entityKind: "file",
          entityId: fileId,
          actorUserId: user.id,
          payload: {
            event: "file_soft_deleted",
            reason: "user_request",
          },
        },
        tx as unknown as Parameters<typeof logAudit>[1],
      );
    });
    return { success: true };
  },
};
