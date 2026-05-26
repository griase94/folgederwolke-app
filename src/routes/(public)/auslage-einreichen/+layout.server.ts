/**
 * Layout-level load for /auslage-einreichen.
 *
 * Provides `members` and `projects` to the page so the AuslagenForm can
 * render its project-select. C9/AT-002 fixed the projects path (previously
 * a stub `projects: []`) — the form now reads the actual active project list
 * from the DB.
 *
 * `members` is still a stub: the public form does not surface a member
 * picker (members self-identify by typing name + email), so we keep the
 * contract but return [] until a future feature needs it.
 */

import { isNull } from "drizzle-orm";
import type { LayoutServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { projects as projectsTable } from "$lib/server/db/schema/projects.js";

export const load: LayoutServerLoad = async () => {
  const db = getDb();

  // Active (non-archived) projects, ordered by name for deterministic UI.
  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
    })
    .from(projectsTable)
    .where(isNull(projectsTable.deletedAt))
    .orderBy(projectsTable.name);

  const projects: Array<{ id: string; name: string }> = rows.map((r) => ({
    id: r.id,
    name: r.name,
  }));

  // Members are not exposed on the public form — see note above.
  const members: Array<{ id: string; display_name: string; email?: string }> =
    [];

  return { members, projects };
};
