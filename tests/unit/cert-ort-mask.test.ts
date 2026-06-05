import { describe, it, expect } from "vitest";
import { maskOrtFromAdresse } from "$lib/server/pdf/templates/bescheinigung-template.js";

/**
 * The Zuwendungsbestätigung's "Ort, Datum" signature line extracts the Ort
 * (place of issue) from the Verein address via maskOrtFromAdresse. It must
 * yield a clean city — never a literal "\n" or the whole raw address — for
 * EVERY shape VEREIN_ADRESSE can take, because $env/dynamic/private returns the
 * Vercel value verbatim (a "c/o …\n…" entered in the dashboard reaches us as a
 * literal backslash-n, not a real newline). This is a legal document.
 */
describe("maskOrtFromAdresse — Ort extraction for the Bescheinigung", () => {
  it("real-newline multi-line address → city only", () => {
    expect(
      maskOrtFromAdresse(
        "c/o Jonas Hackenberg\nWestermühlstraße 6\n80469 München",
      ),
    ).toBe("München");
  });

  it("literal backslash-n address (Vercel verbatim) → city only, no \\n leaks", () => {
    const out = maskOrtFromAdresse(
      "c/o Jonas Hackenberg\\nWestermühlstraße 6\\n80469 München",
    );
    expect(out).toBe("München");
    expect(out).not.toContain("\\n");
  });

  it("legacy comma single-line address → city only", () => {
    expect(maskOrtFromAdresse("Westermühlstraße 6, 80469 München")).toBe(
      "München",
    );
  });

  it("falls back to the last segment when no PLZ pattern is present", () => {
    expect(maskOrtFromAdresse("Postfach 1234\\nMünchen")).toBe("München");
  });
});
