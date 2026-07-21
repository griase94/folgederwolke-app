import { describe, expect, it } from "vitest";
import { previewBadge } from "./invoice-preview-badge.js";

describe("previewBadge (stale-flag state machine)", () => {
  const H1 = "abc123";
  const H2 = "def456";

  it("shows 'wird_aktualisiert' on the first-ever render (nothing rendered yet)", () => {
    expect(previewBadge("loading", null, H1)).toBe("wird_aktualisiert");
  });

  it("shows 'aktuell' when the on-screen PDF matches the current form", () => {
    // THE REGRESSION GUARD: a settled render must read 'aktuell', not the old
    // permanently-stuck 'veraltet'. renderedHash === currentHash, phase idle.
    expect(previewBadge("idle", H1, H1)).toBe("aktuell");
  });

  it("shows 'veraltet' once the form changed since the last render", () => {
    // renderedHash is the OLD input's hash; currentHash moved on.
    expect(previewBadge("idle", H1, H2)).toBe("veraltet");
  });

  it("keeps 'veraltet' while the re-fetch for the changed input is in flight", () => {
    // Stable through the whole change→render window (phase 'loading' but the
    // displayed hash still lags), so the badge doesn't flicker per keystroke.
    expect(previewBadge("loading", H1, H2)).toBe("veraltet");
  });

  it("flips back to 'aktuell' the moment the fresh render lands", () => {
    expect(previewBadge("idle", H2, H2)).toBe("aktuell");
  });

  it("shows 'veraltet' on a failed fetch (last-good PDF stays visible)", () => {
    expect(previewBadge("error", H1, H1)).toBe("veraltet");
    expect(previewBadge("error", H1, H2)).toBe("veraltet");
  });
});
