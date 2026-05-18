/**
 * Re-exports the Zod schema from the server domain module so client
 * code has the same single source of truth without importing server-only deps.
 *
 * IMPORTANT: auslagen.ts is imported from $lib/server/domain — it only
 * uses `zod` which is universal, so this re-export is SSR-safe.
 */

export {
  auslageInputSchema,
  type AuslageInput,
  type BezahltVon,
} from "$lib/server/domain/auslagen.js";
