import { describe, it, expect } from "vitest";
import { isPdfScanLikely } from "$lib/client/file-compress";

describe("isPdfScanLikely", () => {
  it("false for small PDFs", () =>
    expect(isPdfScanLikely({ size: 800_000, firstPageTextLen: 0 })).toBe(
      false,
    ));
  it("true for big + text-poor", () =>
    expect(isPdfScanLikely({ size: 5_000_000, firstPageTextLen: 50 })).toBe(
      true,
    ));
  it("false for big + text-rich", () =>
    expect(isPdfScanLikely({ size: 5_000_000, firstPageTextLen: 500 })).toBe(
      false,
    ));
});
