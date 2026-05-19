/**
 * Shared Projekte CRUD action helpers.
 *
 * Each function validates input, performs the DB write, and emits the
 * matching `project.*` event on the in-process bus (audit log written by
 * the registered handler).
 *
 * §4.1.1 #2 (event bus for side effects).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";
import {
  validateAddProject,
  validateEditProject,
} from "$lib/server/domain/projects.js";
import { bus } from "$lib/server/events/index.js";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ActionFailure = {
  ok: false;
  status: number;
  error?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, unknown>;
};

export type AddProjectResult = { ok: true; projectId: string } | ActionFailure;
export type EditProjectResult = { ok: true } | ActionFailure;
export type DeleteProjectResult = { ok: true } | ActionFailure;

// ---------------------------------------------------------------------------
// Business-ID helper (projects use P-YYYY-NNN pattern)
// ---------------------------------------------------------------------------

async function allocateProjectBusinessId(year: number): Promise<string> {
  const db = getDb();
  // Use advisory lock to serialize per year
  await db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`project_bid:${year}`}))`,
  );
  const rows = await db.execute<{ n: string }>(
    sql`SELECT COUNT(*)::text AS n FROM projects WHERE business_id LIKE ${`P-${year}-%`}`,
  );
  const n = parseInt((rows as { n: string }[])[0]?.n ?? "0", 10);
  return `P-${year}-${(n + 1).toString().padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// addProject
// ---------------------------------------------------------------------------

export async function addProject(
  raw: Record<string, unknown>,
  actorUserId: string | null,
): Promise<AddProjectResult> {
  const result = validateAddProject(raw);
  if (!result.success) {
    return { ok: false, status: 422, errors: result.errors, values: raw };
  }

  const db = getDb();
  const { name, sphere_default, start_date, end_date, notes } = result.data;
  const year = new Date().getFullYear();
  const businessId = await allocateProjectBusinessId(year);

  const inserted = await db
    .insert(projects)
    .values({
      businessId,
      name,
      sphereDefault:
        (sphere_default as
          | "ideeller"
          | "vermoegen"
          | "zweckbetrieb"
          | "wirtschaftlich"
          | null
          | undefined) ?? null,
      startDate: start_date ?? null,
      endDate: end_date ?? null,
      notes: notes ?? null,
    })
    .returning({ id: projects.id });

  const projectId = inserted[0]?.id ?? "";

  await bus.emit("project.created", {
    projectId,
    actorUserId,
    payload: { name, businessId, sphereDefault: sphere_default ?? null },
  });

  return { ok: true, projectId };
}

// ---------------------------------------------------------------------------
// editProject
// ---------------------------------------------------------------------------

export async function editProject(
  raw: Record<string, unknown>,
  actorUserId: string | null,
): Promise<EditProjectResult> {
  const result = validateEditProject(raw);
  if (!result.success) {
    return { ok: false, status: 422, errors: result.errors, values: raw };
  }

  const db = getDb();
  const { id, name, sphere_default, start_date, end_date, notes } = result.data;

  await db
    .update(projects)
    .set({
      name,
      sphereDefault:
        (sphere_default as
          | "ideeller"
          | "vermoegen"
          | "zweckbetrieb"
          | "wirtschaftlich"
          | null
          | undefined) ?? null,
      startDate: start_date ?? null,
      endDate: end_date ?? null,
      notes: notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));

  await bus.emit("project.updated", {
    projectId: id,
    actorUserId,
    payload: { name },
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// softDeleteProject
// ---------------------------------------------------------------------------

export async function softDeleteProject(
  projectId: string,
  actorUserId: string | null,
): Promise<DeleteProjectResult> {
  if (!projectId) {
    return { ok: false, status: 400, error: "Fehlende Projekt-ID" };
  }

  const db = getDb();
  await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await bus.emit("project.deleted", {
    projectId,
    actorUserId,
  });

  return { ok: true };
}
