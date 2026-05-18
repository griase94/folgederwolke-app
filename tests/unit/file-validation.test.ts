/**
 * @phase-2
 *
 * Marker file — the actual test suite lives at
 * `src/lib/server/domain/file-validation.test.ts` because vitest's include
 * glob is scoped to `src/**`. Keeping this stub here so the path declared
 * in the Phase-2 hardening spec exists in the tree.
 */
import { describe, it, expect } from "vitest";
import {
  sniffMime,
  ALLOWED_BELEG_MIMES,
} from "../../src/lib/server/domain/file-validation.js";

describe("file-validation (smoke)", () => {
  it("identifies PDF magic bytes", () => {
    const pdf = new Uint8Array(16);
    pdf.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(sniffMime(pdf)).toBe("application/pdf");
  });
  it("exposes the allowed MIME list", () => {
    expect(ALLOWED_BELEG_MIMES.length).toBeGreaterThan(0);
  });
});
