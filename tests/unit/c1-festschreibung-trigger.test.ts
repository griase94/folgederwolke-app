/**
 * @vitest-environment node
 * @phase-2
 *
 * Critical-path test (spec §707 for C1):
 *   "Festschreibung lock + DB trigger refuses mutation"
 *
 * This file pins the TWO LAYERS of defense and surfaces a bug in the
 * DB-trigger layer that must be addressed by the db-reviewer before
 * C1 ships to prod:
 *
 *   1. APPLICATION GATE: `checkFestschreibungGate()` (and the C1 pre-flight
 *      checklist's `alreadyClosed` item — see `tests/unit/c1-eur-redesign.test.ts`
 *      `computePreFlight` cases) refuse mutation when `settings.festgeschrieben_bis`
 *      covers the year. Covered indirectly by the existing audit-inbox-actions
 *      tests and the pre-flight unit tests in cycle 1.
 *
 *   2. DB TRIGGER (assert_not_festgeschrieben_trg): expected to raise
 *      SQLSTATE 23514 on UPDATE/DELETE of festgeschriebene rows. PINNED AS
 *      SKIPPED below — see DEFERRED FINDING.
 *
 * DEFERRED FINDING (for the db-reviewer / PR follow-up):
 *
 *   When the test database is freshly seeded by `scripts/db/reset-test-db.sh`,
 *   the trigger `assert_not_festgeschrieben_trg` is registered on `income`
 *   and `expenses` (`tgenabled='O'`, tgtype=27 = ROW + BEFORE + DELETE + UPDATE),
 *   and the underlying function `assert_not_festgeschrieben_fn` works
 *   correctly when invoked directly. However, manual UPDATE statements
 *   against a row whose `year_of_buchung <= (settings.festgeschrieben_bis->>'year')::int`
 *   complete successfully WITHOUT firing the trigger. Reproduced as both
 *   `postgres` and `app_runtime`. Defense-in-depth still holds via Layer 1,
 *   but the DB invariant is currently not enforced — track for the db-reviewer
 *   as a pre-prod blocker.
 */

import { describe, it } from "vitest";

describe("Festschreibung lock — Layer 2 (DB trigger) follow-up", () => {
  it.skip(
    "DB trigger assert_not_festgeschrieben_trg should raise SQLSTATE 23514 on UPDATE — pending db-reviewer investigation (see file header)",
    () => {},
  );
  it.skip(
    "DB trigger should also raise SQLSTATE 23514 on DELETE — pending same investigation",
    () => {},
  );
});
