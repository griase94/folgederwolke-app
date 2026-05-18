/**
 * Layout-level load for /auslage-einreichen.
 *
 * Provides `members` and `projects` to the page without touching the action's
 * +page.server.ts. Both are Phase-3 endpoints; for now we return empty arrays
 * so the form degrades to its stub state.
 *
 * When Phase 3 adds /api/members and /api/projects, replace the stubs below
 * with real DB queries (imported from the domain layer — never raw SQL here).
 */

import type { LayoutServerLoad } from "./$types.js";

export const load: LayoutServerLoad = async () => {
  // Phase 3: load from DB / API
  const members: Array<{ id: string; display_name: string; email?: string }> =
    [];
  const projects: Array<{ id: string; name: string }> = [];

  return { members, projects };
};
