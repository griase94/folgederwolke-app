/**
 * Sphere overrides — POST-Festschreibung corrections (ADR-0011).
 *
 * **DEFERRED TO PHASE 2 PER D11.** This file is a stub so the schema barrel
 * import doesn't break and so the Drizzle migration planner doesn't see a
 * gap. The real `effective_sphere(expense_id)` SQL function + the v_eur /
 * v_dashboard_kpis rewrites that use it ship in Phase 2.
 *
 * For v1, all EÜR/dashboard views read `expenses.sphere_snapshot` directly.
 *
 * Once activated in Phase 2:
 *  - Append-only rows: (target_kind, target_id, new_sphere, reason, created_by, created_at)
 *  - effective_sphere(id) returns the latest row's new_sphere or the snapshot
 *  - Festschreibung does NOT lock this table — that's the whole point
 */

// Intentionally no table export — Phase 2 will add it.
export const __sphereOverridesPlaceholder = true;
