# ADR-0008: Project-level sphere default

**Status:** Accepted (Phase 1, applied)

## Context

A project's sphere is not always implicit from its kategorien. Concrete case:
a Bar-Pop-up event in Sommer 2026. Its Honorar-Künstler:innen line items have
kategorie sphere `zweckbetrieb` (artistic services); its Getränke-Einkauf
lines have kategorie sphere `wirtschaftlich`. Both belong to the same event.
The event ITSELF runs in the wirtschaftlich sphere (it's a bar — commercial).

If we always derive sphere from kategorie, this event's costs split confusingly
across EÜR-Spalten. The Vorstand needs to be able to say "this whole project
runs in the wirtschaftlich sphere" and have the EÜR cooperate.

## Decision

`projects.sphere_default sphere NULL` — optional override of the kategorie's
sphere for any expense linked to this project.

Resolution order at expense write-time (domain layer, NOT the DB):

1. If `projects.sphere_default` is set AND `expenses.sphere_override` is null
   → use `projects.sphere_default`.
2. Else use `kategorie.sphere`.

Whichever wins is what gets snapshotted in `expenses.sphere_snapshot`
(ADR-0002 — once written, immutable per row).

Per-expense override:

- `expenses.sphere_override sphere NULL` — for pre-Festschreibung admin
  correction of individual rows.
- `expenses.sphere_override_reason text` — required when sphere_override is
  set (UX, not DB CHECK).

## Post-Festschreibung corrections

Per ADR-0011 (deferred to Phase 2 per D11) — `sphere_overrides` table allows
appending corrections after Festschreibung without mutating sealed rows.
v1 ships without sphere_overrides; v1 corrections must happen pre-close.

## Consequences

- Domain function `deriveSphereForNewExpense(kategorie, project, override)`
  returns the canonical sphere. Lives in `src/lib/server/domain/sphere.ts`
  (Phase 2; v1 has the pure helper in `src/lib/domain/sphere.ts`).
- EÜR view (Phase 6) sums `expenses.sphere_snapshot` directly. No JOIN to
  kategorien or projects required — the snapshot already encodes everything.
