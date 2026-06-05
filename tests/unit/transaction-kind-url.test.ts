/**
 * @phase-7 C7 cycle 2 — kind=… URL DE↔EN mapping (C7-1)
 *
 * The FabBottomSheet emits German URL slugs (`ausgabe|einnahme|spende`),
 * the domain enum is English (`expense|income|donation`). This helper is
 * the SINGLE source of truth for both directions and is shared with the
 * C3 (dashboard quick-actions) cluster.
 */

import { describe, it, expect } from "vitest";
import {
  parseKindFromUrl,
  buildNeuUrlForKind,
  KIND_DE_TO_EN,
  KIND_EN_TO_DE,
} from "$lib/domain/transaction-kind-url.js";

describe("parseKindFromUrl", () => {
  it("maps the canonical German slugs to the English domain enum", () => {
    expect(parseKindFromUrl("ausgabe")).toBe("expense");
    expect(parseKindFromUrl("einnahme")).toBe("income");
    expect(parseKindFromUrl("spende")).toBe("donation");
  });

  it("accepts English aliases (so internal callers don't have to translate)", () => {
    expect(parseKindFromUrl("expense")).toBe("expense");
    expect(parseKindFromUrl("income")).toBe("income");
    expect(parseKindFromUrl("donation")).toBe("donation");
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(parseKindFromUrl("AUSGABE")).toBe("expense");
    expect(parseKindFromUrl(" Einnahme ")).toBe("income");
  });

  it("returns null for missing / empty / unknown input", () => {
    expect(parseKindFromUrl(null)).toBeNull();
    expect(parseKindFromUrl(undefined)).toBeNull();
    expect(parseKindFromUrl("")).toBeNull();
    expect(parseKindFromUrl("   ")).toBeNull();
    expect(parseKindFromUrl("foo")).toBeNull();
    expect(parseKindFromUrl("ausgaben")).toBeNull(); // close-but-no-cigar
  });
});

describe("buildNeuUrlForKind", () => {
  // Phase 8 T6: /app/transactions/neu retired → per-tab /app/{tab}/neu.
  it("produces per-tab /app/{tab}/neu URLs (no ?kind= param needed)", () => {
    expect(buildNeuUrlForKind("expense")).toBe("/app/ausgaben/neu");
    expect(buildNeuUrlForKind("income")).toBe("/app/einnahmen/neu");
    expect(buildNeuUrlForKind("donation")).toBe("/app/spenden/neu");
  });
});

describe("KIND_DE_TO_EN / KIND_EN_TO_DE round-trips", () => {
  it("EN→DE→EN is identity for every domain kind", () => {
    for (const en of ["expense", "income", "donation"] as const) {
      const de = KIND_EN_TO_DE[en];
      expect(KIND_DE_TO_EN[de]).toBe(en);
    }
  });
});
