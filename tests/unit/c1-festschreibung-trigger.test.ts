/**
 * @vitest-environment node
 * @phase-2
 *
 * Critical-path test (spec §707 for C1): "Festschreibung lock + DB trigger
 * refuses mutation".
 *
 * The original skipped pin lived here because the DB trigger function in
 * 0010_post_review_hardening.sql expected `settings.value` to be a JSON object
 * shaped `{"year": 2025}`, but the app persists it as a bare jsonb number
 * (`2025`). The mismatch made the trigger silently short-circuit. The C1
 * cycle 1 audit flagged this as a pre-prod blocker.
 *
 * Migration 0014 (Tier 1 critical hardening) rebuilds the trigger function
 * with a tolerant jsonb→integer extractor and additionally wires the trigger
 * to fire on INSERT (not just UPDATE/DELETE). Concrete UPDATE/DELETE/INSERT
 * coverage now lives in `tier-1-prod-hardening.test.ts` — see the
 * "Tier 1 — Festschreibung INSERT trigger (C1)" describe block.
 */

import { describe, it } from "vitest";

describe("Festschreibung lock — Layer 2 (DB trigger)", () => {
  it.todo(
    "covered in tier-1-prod-hardening.test.ts (INSERT/UPDATE/DELETE on locked year all raise SQLSTATE 23514)",
  );
});
