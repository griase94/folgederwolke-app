/**
 * Event bus barrel — §4.1.1 #2.
 *
 * Re-exports the shared bus instance, event type registry, and the idempotent
 * `registerHandlers()` initializer.
 *
 * Import sites:
 *   - Route actions/services call `bus.emit(...)` (typed via Events).
 *   - `src/hooks.server.ts` calls `registerHandlers()` once at module load.
 */

export { bus } from "./bus.js";
export { registerHandlers } from "./handlers.js";
export type { Events, EventName, EventPayload } from "./types.js";
