/**
 * C2-TAX — post-cluster: beleg_name, beleg_mime_type, rechnungsdatum are
 * required at the Zod schema level. Tax-correctness gate (JB-014 / VB-004).
 *
 * Pre-C2-TAX these three were `.optional()` and the action filled them from
 * the multipart File header. That meant a JSON-only payload (or one without
 * a Beleg attached) could pass Zod validation and reach the action body —
 * the silent skip there meant a submission without a receipt was technically
 * possible. EÜR §11 EStG requires the receipt + invoice date for every
 * expense, so they belong as schema-level required fields.
 */
import { describe, it, expect } from "vitest";
import { auslageInputSchema } from "$lib/server/domain/auslagen.js";

const minimal = {
  bezeichnung: "Test-Beleg",
  betragCents: 1000,
  currency: "EUR",
  bezahlt_von: { kind: "verein" as const },
  consent_text_version: "v1",
  beleg_name: "x.pdf",
  beleg_mime_type: "application/pdf" as const,
  rechnungsdatum: "2025-05-01",
};

describe("auslageInputSchema (post-C2-TAX requireds)", () => {
  it("accepts a fully populated minimal input", () => {
    const r = auslageInputSchema.safeParse(minimal);
    expect(r.success).toBe(true);
  });

  it("rejects missing beleg_name", () => {
    const { beleg_name: _unused, ...rest } = minimal;
    void _unused;
    const r = auslageInputSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects missing beleg_mime_type", () => {
    const { beleg_mime_type: _unused, ...rest } = minimal;
    void _unused;
    const r = auslageInputSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects missing rechnungsdatum", () => {
    const { rechnungsdatum: _unused, ...rest } = minimal;
    void _unused;
    const r = auslageInputSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("rejects malformed rechnungsdatum (not YYYY-MM-DD)", () => {
    const r = auslageInputSchema.safeParse({
      ...minimal,
      rechnungsdatum: "01.05.2025",
    });
    expect(r.success).toBe(false);
  });
});
