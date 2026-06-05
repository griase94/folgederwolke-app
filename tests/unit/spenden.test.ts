/**
 * @phase-5
 *
 * Unit tests for the Spenden domain: validation, BMF Pflichtfeld extraction,
 * "Betrag in Worten" German number-to-words, and the Bescheinigungs-Nr
 * yearly-reset invariant on the in-memory allocator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  betragInWorten,
  validateSpendeInput,
} from "$lib/server/domain/spenden.js";

// ---------------------------------------------------------------------------
// In-memory allocator (mirrors id-allocator yearly shard semantics)
// ---------------------------------------------------------------------------

function makeInMemoryAllocator() {
  const counters: Map<string, number> = new Map();
  let lock: Promise<void> = Promise.resolve();
  function allocate(kind: string, year: number): Promise<string> {
    const result = lock.then(() => {
      const key = `${year}:${kind}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return `${kind}-${year}-${next.toString().padStart(3, "0")}`;
    });
    lock = result.then(() => undefined);
    return result;
  }
  return { allocate, counters };
}

describe("Bescheinigungs-Nr allocator (yearly reset, D10)", () => {
  it("starts at 001 for each new year", async () => {
    const { allocate } = makeInMemoryAllocator();
    const b2026 = await allocate("B", 2026);
    const b2027 = await allocate("B", 2027);
    expect(b2026).toBe("B-2026-001");
    expect(b2027).toBe("B-2027-001");
  });

  it("increments within the same year", async () => {
    const { allocate } = makeInMemoryAllocator();
    const a = await allocate("B", 2026);
    const b = await allocate("B", 2026);
    const c = await allocate("B", 2026);
    expect(a).toBe("B-2026-001");
    expect(b).toBe("B-2026-002");
    expect(c).toBe("B-2026-003");
  });

  it("isolates B from S (Spende business_id) — independent counters", async () => {
    const { allocate } = makeInMemoryAllocator();
    const s = await allocate("S", 2026);
    const b = await allocate("B", 2026);
    expect(s).toBe("S-2026-001");
    expect(b).toBe("B-2026-001");
  });

  it("50 parallel B-allocations produce no duplicates", async () => {
    const { allocate } = makeInMemoryAllocator();
    const ids = await Promise.all(
      Array.from({ length: 50 }, () => allocate("B", 2026)),
    );
    expect(new Set(ids).size).toBe(50);
    const sorted = [...ids].sort();
    expect(sorted[0]).toBe("B-2026-001");
    expect(sorted[49]).toBe("B-2026-050");
  });
});

// ---------------------------------------------------------------------------
// betragInWorten — German number-to-words
// ---------------------------------------------------------------------------

describe("betragInWorten — German number-to-words", () => {
  it("1 Euro singular", () => {
    expect(betragInWorten(100)).toBe("Ein Euro");
  });
  it("0 cents only — no 'und … Cent' tail", () => {
    expect(betragInWorten(0)).toBe("Null Euro");
  });
  it("9 cents", () => {
    expect(betragInWorten(9)).toBe("Null Euro und neun Cent");
  });
  it("1.99", () => {
    expect(betragInWorten(199)).toBe("Ein Euro und neunundneunzig Cent");
  });
  it("21 Euro — 'einundzwanzig'", () => {
    expect(betragInWorten(2100)).toBe("Einundzwanzig Euro");
  });
  it("100 Euro — 'einhundert'", () => {
    expect(betragInWorten(10000)).toBe("Einhundert Euro");
  });
  it("327.09 — masterplan example", () => {
    expect(betragInWorten(32709)).toBe(
      "Dreihundertsiebenundzwanzig Euro und neun Cent",
    );
  });
  it("530.00 — common Bescheinigung amount", () => {
    expect(betragInWorten(53000)).toBe("Fünfhundertdreißig Euro");
  });
  it("1000.00 — 'eintausend'", () => {
    expect(betragInWorten(100000)).toBe("Eintausend Euro");
  });
  it("1234.56", () => {
    expect(betragInWorten(123456)).toBe(
      "Eintausendzweihundertvierunddreißig Euro und sechsundfünfzig Cent",
    );
  });
  it("accepts bigint input", () => {
    expect(betragInWorten(50000n)).toBe("Fünfhundert Euro");
  });
});

// ---------------------------------------------------------------------------
// validateSpendeInput — BMF Pflichtfeld validation
// ---------------------------------------------------------------------------

describe("validateSpendeInput — BMF Pflichtfeld validation", () => {
  const validMember = {
    spende_kind: "geldspende",
    zugewendet_am: "2026-04-15",
    betragCents: 30000,
    member_id: "550e8400-e29b-41d4-a716-446655440000",
    kategorie_id: "550e8400-e29b-41d4-a716-446655440001",
    zweckbindung_kind: "zweckfrei",
  };

  it("accepts valid member-Geldspende", () => {
    const r = validateSpendeInput({ ...validMember });
    expect(r.success).toBe(true);
  });

  it("rejects aufwandsspende (D9 — deferred)", () => {
    const r = validateSpendeInput({
      ...validMember,
      spende_kind: "aufwandsspende",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(r.errors)).toContain("spende_kind");
    }
  });

  it("rejects negative betrag", () => {
    const r = validateSpendeInput({ ...validMember, betragCents: -100 });
    expect(r.success).toBe(false);
  });

  it("rejects zero betrag", () => {
    const r = validateSpendeInput({ ...validMember, betragCents: 0 });
    expect(r.success).toBe(false);
  });

  it("rejects extern Spender without name + adresse", () => {
    const r = validateSpendeInput({
      ...validMember,
      member_id: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(r.errors)).toContain("spender_name");
    }
  });

  it("rejects extern Spender with name but no adresse", () => {
    const r = validateSpendeInput({
      ...validMember,
      member_id: "",
      spender_name: "Max Mustermann",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(r.errors)).toContain("spender_adresse");
    }
  });

  it("accepts extern Spender with name + adresse", () => {
    const r = validateSpendeInput({
      ...validMember,
      member_id: "",
      spender_name: "Max Mustermann",
      spender_adresse: "Hauptstr. 1, 80331 München",
    });
    expect(r.success).toBe(true);
  });

  it("Sachspende requires beschreibung + wertermittlung", () => {
    const r = validateSpendeInput({
      ...validMember,
      spende_kind: "sachspende",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(r.errors)).toEqual(
        expect.arrayContaining(["sache_beschreibung", "sache_wertermittlung"]),
      );
    }
  });

  it("Sachspende accepts beschreibung + wertermittlung", () => {
    const r = validateSpendeInput({
      ...validMember,
      spende_kind: "sachspende",
      sache_beschreibung: "Laptop Dell XPS 13, Bj. 2022",
      sache_wertermittlung: "verkehrswert",
    });
    expect(r.success).toBe(true);
  });

  it("zweckgebunden requires text", () => {
    const r = validateSpendeInput({
      ...validMember,
      zweckbindung_kind: "zweckgebunden",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(r.errors)).toContain("zweckbindung_text");
    }
  });

  it("accepts betrag_eur string with comma decimal separator (de-DE)", () => {
    const r = validateSpendeInput({
      ...validMember,
      betragCents: undefined,
      betrag_eur: "300,00",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.betragCents).toBe(30000);
  });

  it("accepts >= 300 EUR threshold spende (Phase-5 exit criterion)", () => {
    const r = validateSpendeInput({
      ...validMember,
      betragCents: 30000,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.betragCents).toBe(30000);
  });
});

// ---------------------------------------------------------------------------
// isBescheinigungEnabled — BMF VZ Pflichtfeld validation (A1)
// ---------------------------------------------------------------------------

describe("isBescheinigungEnabled — Freistellungsbescheid VZ Pflicht", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function loadWithEnv(overrides: Record<string, string>) {
    for (const [k, v] of Object.entries(overrides)) {
      vi.stubEnv(k, v);
    }
    const mod = await import("$lib/server/domain/spenden.js");
    return mod.isBescheinigungEnabled();
  }

  it("returns false when BESCHEID_DATUM is empty (no Bescheid)", async () => {
    const enabled = await loadWithEnv({
      VEREIN_BESCHEID_TYP: "freistellungsbescheid",
      VEREIN_BESCHEID_DATUM: "",
      VEREIN_FREISTELLUNGSBESCHEID_VZ: "2024",
    });
    expect(enabled).toBe(false);
  });

  it("returns false when typ=freistellungsbescheid but VZ is empty", async () => {
    const enabled = await loadWithEnv({
      VEREIN_BESCHEID_TYP: "freistellungsbescheid",
      VEREIN_BESCHEID_DATUM: "2024-03-15",
      VEREIN_FREISTELLUNGSBESCHEID_VZ: "",
    });
    expect(enabled).toBe(false);
  });

  it("returns true when typ=freistellungsbescheid + DATUM + VZ all present", async () => {
    const enabled = await loadWithEnv({
      VEREIN_BESCHEID_TYP: "freistellungsbescheid",
      VEREIN_BESCHEID_DATUM: "2024-03-15",
      VEREIN_FREISTELLUNGSBESCHEID_VZ: "2024",
    });
    expect(enabled).toBe(true);
  });

  it("returns false when typ=feststellung_60a without SATZUNG_FASSUNG", async () => {
    const enabled = await loadWithEnv({
      VEREIN_BESCHEID_TYP: "feststellung_60a",
      VEREIN_BESCHEID_DATUM: "2024-03-15",
      VEREIN_SATZUNG_FASSUNG: "",
    });
    expect(enabled).toBe(false);
  });

  it("returns true when typ=feststellung_60a + DATUM + SATZUNG_FASSUNG", async () => {
    const enabled = await loadWithEnv({
      VEREIN_BESCHEID_TYP: "feststellung_60a",
      VEREIN_BESCHEID_DATUM: "2024-03-15",
      VEREIN_SATZUNG_FASSUNG: "2022-06-01",
    });
    expect(enabled).toBe(true);
  });

  // White-label Phase 1 — Task 1.6: empty steuerbegünstigte Zwecke disables
  // issuance (the Pflichttext quotes them verbatim; we never render an empty
  // Zweck). The UI hides issuance when this returns false.
  it("returns false when STEUERBEGUENSTIGTE_ZWECKE is empty (otherwise valid)", async () => {
    const enabled = await loadWithEnv({
      VEREIN_BESCHEID_TYP: "freistellungsbescheid",
      VEREIN_BESCHEID_DATUM: "2024-03-15",
      VEREIN_FREISTELLUNGSBESCHEID_VZ: "2024",
      VEREIN_STEUERBEGUENSTIGTE_ZWECKE: "   ",
    });
    expect(enabled).toBe(false);
  });
});
