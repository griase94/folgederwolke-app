/**
 * @phase-2
 *
 * Unit tests for Beleg file-validation magic-byte sniff (B2 hardening).
 *
 * Coverage:
 *  - sniffMime correctly identifies PDF / JPEG / PNG / HEIC / WebP
 *  - validateBeleg accepts matched (declared, sniffed) pairs
 *  - validateBeleg rejects mismatched declared vs sniffed
 *  - validateBeleg rejects oversize and empty buffers
 *  - sanitizeFilename strips dangerous chars
 */

import { describe, it, expect } from "vitest";
import {
  sniffMime,
  validateBeleg,
  sanitizeFilename,
  MAX_BELEG_BYTES,
  ALLOWED_BELEG_MIMES,
} from "./file-validation.js";

// ---------------------------------------------------------------------------
// Minimal magic-byte fixtures (just enough to trip the sniff)
// ---------------------------------------------------------------------------

function bytes(...arr: number[]): Uint8Array {
  // Pad to 16 bytes — sniffMime requires >= 8 bytes.
  const out = new Uint8Array(Math.max(16, arr.length));
  for (let i = 0; i < arr.length; i++) out[i] = arr[i]!;
  return out;
}

const PDF_HEADER = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34); // "%PDF-1.4"
const JPEG_HEADER = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46); // "...JF"
const PNG_HEADER = bytes(
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
  0x00,
  0x0d,
);
// "RIFF????WEBP"
const WEBP_HEADER = bytes(
  0x52,
  0x49,
  0x46,
  0x46,
  0x10,
  0x00,
  0x00,
  0x00,
  0x57,
  0x45,
  0x42,
  0x50,
);
// "????ftypheic"
const HEIC_HEADER = bytes(
  0x00,
  0x00,
  0x00,
  0x18,
  0x66,
  0x74,
  0x79,
  0x70,
  0x68,
  0x65,
  0x69,
  0x63,
);
// "????ftypheif"
const HEIF_HEADER = bytes(
  0x00,
  0x00,
  0x00,
  0x18,
  0x66,
  0x74,
  0x79,
  0x70,
  0x68,
  0x65,
  0x69,
  0x66,
);

// ---------------------------------------------------------------------------
// sniffMime
// ---------------------------------------------------------------------------

describe("sniffMime", () => {
  it("identifies PDF", () => {
    expect(sniffMime(PDF_HEADER)).toBe("application/pdf");
  });
  it("identifies JPEG", () => {
    expect(sniffMime(JPEG_HEADER)).toBe("image/jpeg");
  });
  it("identifies PNG", () => {
    expect(sniffMime(PNG_HEADER)).toBe("image/png");
  });
  it("identifies WebP", () => {
    expect(sniffMime(WEBP_HEADER)).toBe("image/webp");
  });
  it("identifies HEIC", () => {
    expect(sniffMime(HEIC_HEADER)).toBe("image/heic");
  });
  it("identifies HEIF", () => {
    expect(sniffMime(HEIF_HEADER)).toBe("image/heif");
  });
  it("returns null for unknown bytes", () => {
    expect(
      sniffMime(bytes(0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07)),
    ).toBe(null);
  });
  it("returns null for too-short buffer", () => {
    expect(sniffMime(new Uint8Array([0x25, 0x50]))).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// validateBeleg
// ---------------------------------------------------------------------------

describe("validateBeleg — accepts matched declared+sniffed pairs", () => {
  it("accepts PDF/PDF", () => {
    expect(validateBeleg(PDF_HEADER, "application/pdf")).toEqual({
      valid: true,
      sniffedMime: "application/pdf",
    });
  });
  it("accepts JPEG/JPEG", () => {
    expect(validateBeleg(JPEG_HEADER, "image/jpeg")).toEqual({
      valid: true,
      sniffedMime: "image/jpeg",
    });
  });
  it("accepts PNG/PNG", () => {
    expect(validateBeleg(PNG_HEADER, "image/png")).toEqual({
      valid: true,
      sniffedMime: "image/png",
    });
  });
  it("accepts WebP/WebP", () => {
    expect(validateBeleg(WEBP_HEADER, "image/webp")).toEqual({
      valid: true,
      sniffedMime: "image/webp",
    });
  });
  it("accepts HEIC declared as HEIF (interchangeable)", () => {
    expect(validateBeleg(HEIC_HEADER, "image/heif").valid).toBe(true);
  });
});

describe("validateBeleg — rejects mismatched declared+sniffed", () => {
  it("rejects PNG bytes declared as PDF", () => {
    const r = validateBeleg(PNG_HEADER, "application/pdf");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/Mismatch|Mismatch/i);
  });
  it("rejects JPEG bytes declared as PNG", () => {
    const r = validateBeleg(JPEG_HEADER, "image/png");
    expect(r.valid).toBe(false);
  });
});

describe("validateBeleg — rejects size violations", () => {
  it("rejects empty buffer", () => {
    expect(validateBeleg(new Uint8Array(0), "application/pdf").valid).toBe(
      false,
    );
  });
  it("rejects oversize buffer", () => {
    const tooBig = new Uint8Array(MAX_BELEG_BYTES + 1);
    // Set PDF magic so we don't trip the size check by missing-magic first
    tooBig[0] = 0x25;
    tooBig[1] = 0x50;
    tooBig[2] = 0x44;
    tooBig[3] = 0x46;
    tooBig[4] = 0x2d;
    const r = validateBeleg(tooBig, "application/pdf");
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toMatch(/groß|MiB/);
  });
});

describe("validateBeleg — rejects disallowed declared MIME", () => {
  it("rejects application/zip", () => {
    const r = validateBeleg(PDF_HEADER, "application/zip");
    expect(r.valid).toBe(false);
  });
  it("rejects text/html", () => {
    const r = validateBeleg(PDF_HEADER, "text/html");
    expect(r.valid).toBe(false);
  });
});

describe("ALLOWED_BELEG_MIMES", () => {
  it("contains the documented set", () => {
    expect([...ALLOWED_BELEG_MIMES].sort()).toEqual(
      [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/heif",
        "image/webp",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe("sanitizeFilename", () => {
  it("preserves a normal filename", () => {
    expect(sanitizeFilename("Rechnung_2026.pdf")).toBe("Rechnung_2026.pdf");
  });

  it("preserves the .pdf extension (dot is not stripped)", () => {
    expect(sanitizeFilename("beleg.pdf")).toBe("beleg.pdf");
    expect(sanitizeFilename("Scan-2026.pdf")).toBe("Scan-2026.pdf");
  });

  it("strips control characters (NUL, TAB, LF, DEL)", () => {
    // Build a string with embedded control chars
    const withControl = "evil\x00file\x01name\x7f.pdf";
    const out = sanitizeFilename(withControl);
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("strips path separators and replaces them with underscores", () => {
    // Slashes and backslashes are replaced with underscores, making path
    // traversal impossible. Dots remaining in mid-position are harmless
    // once separators are gone.
    const out1 = sanitizeFilename("../../etc/passwd");
    expect(out1).not.toContain("/");

    const out2 = sanitizeFilename("C:\\Windows\\System32\\file.txt");
    expect(out2).not.toContain("\\");
    expect(out2).not.toContain(":");
  });

  it("preserves the extension when truncating names longer than 120 chars", () => {
    const long = "a".repeat(200) + ".pdf";
    const out = sanitizeFilename(long);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("falls back to 'beleg' on empty input", () => {
    expect(sanitizeFilename("")).toBe("beleg");
  });

  it("falls back to 'beleg' when only leading dots remain", () => {
    expect(sanitizeFilename("...")).toBe("beleg");
  });

  it("strips leading dots (no hidden files)", () => {
    expect(sanitizeFilename(".hidden.pdf")).toBe("hidden.pdf");
  });

  it("collapses whitespace to underscores", () => {
    const out = sanitizeFilename("my receipt 2026.pdf");
    expect(out).toBe("my_receipt_2026.pdf");
  });
});
