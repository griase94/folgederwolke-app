/**
 * file-compress image branch — filename survival (board #162 M1 fix).
 *
 * browser-image-compression returns a Blob-like whose `name` only lives as a
 * monkey-patched property, so appending it to FormData serialises the filename
 * as "blob" and the server persists beleg_original_name='blob'. compressIfNeeded
 * must re-wrap the result in a REAL File carrying the original name (JPEG →
 * .jpg extension). This pins that the wrapped name survives a FormData round-trip.
 */
import { describe, it, expect, vi } from "vitest";

// Mock the lazy-imported compressor to return a small, NAMELESS jpeg blob —
// exactly the shape that dropped the filename before the fix.
vi.mock("browser-image-compression", () => ({
  default: vi.fn(async () => new Blob(["tiny"], { type: "image/jpeg" })),
}));

import { compressIfNeeded } from "./file-compress.js";

function bigPng(name: string): File {
  // Larger than the mocked 4-byte output so the "compressed is smaller" branch
  // (which re-wraps) actually runs.
  return new File([new Uint8Array(50_000)], name, { type: "image/png" });
}

describe("compressIfNeeded — image filename survival", () => {
  it("re-wraps the compressed blob in a File carrying the original name (.jpg), never 'blob'", async () => {
    const out = await compressIfNeeded(bigPng("bon_sommerfest.png"));
    expect(out).toBeInstanceOf(File);
    expect(out.name).toBe("bon_sommerfest.jpg");
    expect(out.name).not.toBe("blob");
    expect(out.type).toBe("image/jpeg");
  });

  it("the filename survives a FormData round-trip (the actual submit path)", async () => {
    const out = await compressIfNeeded(bigPng("quittung.jpeg"));
    const fd = new FormData();
    fd.set("beleg_0", out);
    const got = fd.get("beleg_0");
    expect(got).toBeInstanceOf(File);
    expect((got as File).name).toBe("quittung.jpg");
    expect((got as File).name).not.toBe("blob");
  });
});
