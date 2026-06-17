import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildStatusUrl,
  shareOrCopyStatusLink,
} from "$lib/client/share-status-link.js";

afterEach(() => vi.unstubAllGlobals());

describe("buildStatusUrl", () => {
  it("builds an absolute status URL from origin + ausId", () => {
    expect(buildStatusUrl("AUS-2026-001", "https://verein.example")).toBe(
      "https://verein.example/auslage-status/AUS-2026-001",
    );
  });

  it("URL-encodes unexpected characters in the id", () => {
    expect(buildStatusUrl("AUS 1/2", "https://verein.example")).toBe(
      "https://verein.example/auslage-status/AUS%201%2F2",
    );
  });
});

describe("shareOrCopyStatusLink", () => {
  const URL_ = "https://verein.example/auslage-status/AUS-2026-001";

  it("prefers navigator.share and resolves 'shared'", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    await expect(
      shareOrCopyStatusLink(URL_, "Folge der Wolke e.V."),
    ).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "Auslage-Status — Folge der Wolke e.V.",
      url: URL_,
    });
  });

  it("falls back to clipboard when share is unavailable → 'copied'", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(shareOrCopyStatusLink(URL_, "X")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("returns 'failed' without copying when the user cancels the share sheet", async () => {
    const abort = new DOMException("cancelled", "AbortError");
    const share = vi.fn().mockRejectedValue(abort);
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    await expect(shareOrCopyStatusLink(URL_, "X")).resolves.toBe("failed");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when share throws a non-abort error", async () => {
    const share = vi.fn().mockRejectedValue(new Error("boom"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
    await expect(shareOrCopyStatusLink(URL_, "X")).resolves.toBe("copied");
  });

  it("returns 'failed' when neither share nor clipboard work", async () => {
    vi.stubGlobal("navigator", {});
    await expect(shareOrCopyStatusLink(URL_, "X")).resolves.toBe("failed");
  });
});
