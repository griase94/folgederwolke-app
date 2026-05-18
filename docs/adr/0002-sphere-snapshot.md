# ADR-0002: Sphere + Kategorie name snapshots

**Status:** Accepted (Phase 1, applied)

## Context

Steuerliche Sphäre (`ideeller | vermoegen | zweckbetrieb | wirtschaftlich`)
is the core EÜR-axis. It's derived per row from kategorie.sphere — but
kategorien are renamable + their sphere is editable by Vorstand. If we always
join-read sphere off the current kategorie row, a historical rename or
sphere-shift would silently rewrite past EÜR years.

GoBD requires that booked entries are immutable post-Festschreibung. We need
to lock the sphere AND the display-name at write time.

## Decision

`expenses` / `income` / `donations` / `invoices` each have:

- `kategorie_id` (FK, nullable on delete=restrict) — preserved for live lookups
  (renames propagate to UI).
- `kategorie_name_snapshot text NOT NULL` — captured at insert.
- `sphere_snapshot sphere NOT NULL` — captured at insert.

The domain layer (`src/lib/server/domain/<feature>.ts` in Phase 2+) is
responsible for populating the snapshots from the live kategorie at write
time. No DB trigger — explicit in the application layer.

NO `kategorien_history` table. The snapshot strategy is sufficient because:

- Pre-Festschreibung corrections happen via UPDATE on the snapshot columns.
- Post-Festschreibung corrections happen via `sphere_overrides` (ADR-0011 —
  deferred to Phase 2 per D11) and Storno rows for amount changes.

## Consequences

- EÜR / dashboard queries SUM by `sphere_snapshot` and never touch the live
  kategorie row.
- The `effective_sphere(expense_id)` SQL function (Phase 2) returns the latest
  `sphere_overrides` row's value or, falling back, `sphere_snapshot`. v1 ships
  without it — views read snapshot directly.
- A kategorie rename ("Bürobedarf" → "Büromaterial") never rewrites history.
- Renames + sphere-shifts ARE allowed on the live kategorie row; they affect
  only future inserts. The UI may surface the historical name with a "(was
  Bürobedarf)" hint where useful.
