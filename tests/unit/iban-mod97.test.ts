/**
 * @phase-2
 *
 * Marker file — the actual test suite lives at
 * `src/lib/server/domain/iban.test.ts` because vitest's include glob is
 * scoped to `src/**`. Keeping this stub here so the path declared in the
 * Phase-2 hardening spec exists in the tree.
 */
import { describe, it, expect } from "vitest";
import { validateIban } from "../../src/lib/server/domain/iban.js";

describe("iban-mod97 (smoke)", () => {
  it("accepts a canonical DE IBAN", () => {
    expect(validateIban("DE89370400440532013000")).toBe(true);
  });
});
