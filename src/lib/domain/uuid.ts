/**
 * UUID helpers (shared, pure — safe on client + server).
 *
 * Routes that look a row up by its `uuid` primary key must validate the raw
 * URL param BEFORE issuing the query: postgres-js raises 22P02 ("invalid input
 * syntax for type uuid") for a non-UUID string, which — absent a handleError
 * hook — surfaces as a 500 instead of the intended 404. See F12/F13/F14.
 */

import { error } from "@sveltejs/kit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `s` is a canonical 8-4-4-4-12 UUID (any version, case-insensitive). */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Throw a SvelteKit 404 (with the given German message) when `id` is not a
 * UUID, so a malformed/hand-typed param yields a clean 404 page instead of a
 * raw PostgresError 500. Returns the validated id for ergonomic inlining.
 */
export function assertUuidOr404(
  id: string,
  message = "Nicht gefunden",
): string {
  if (!isUuid(id)) throw error(404, message);
  return id;
}
