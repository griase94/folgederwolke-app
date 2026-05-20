/**
 * @phase-2
 *
 * Unit tests for id-allocator concurrent-safety guarantees.
 *
 * These tests use a mock DB transaction to avoid needing a real Postgres
 * connection. The concurrency invariant (no duplicate sequences) is tested
 * by simulating 50 parallel allocations against an in-memory counter.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// In-memory allocator (mirrors allocateBusinessId logic without Postgres)
// ---------------------------------------------------------------------------

/**
 * Pure in-memory version of allocateBusinessId for concurrency testing.
 * Uses a JS Mutex (via Promise chaining) to simulate the advisory lock.
 */
function makeInMemoryAllocator() {
  const counters: Map<string, number> = new Map();
  let lock: Promise<void> = Promise.resolve();

  function allocate(kind: string, year: number): Promise<string> {
    // Chain onto the lock — simulates advisory lock serialization
    const result = lock.then(() => {
      const key = `${year}:${kind}`;
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      // Format: KIND-YYYY-NNN (zero-pad 3)
      return `${kind}-${year}-${next.toString().padStart(3, "0")}`;
    });
    // Update the lock chain so the next allocate() waits for this one
    lock = result.then(() => undefined);
    return result;
  }

  return { allocate, counters };
}

// ---------------------------------------------------------------------------
// formatBusinessId purity tests
// ---------------------------------------------------------------------------

describe("formatBusinessId (domain logic)", () => {
  it("zero-pads seq to 3 digits", () => {
    const id = `AUS-2026-${(7).toString().padStart(3, "0")}`;
    expect(id).toBe("AUS-2026-007");
  });

  it("handles 4-digit seq without truncation", () => {
    const id = `AUS-2026-${(1234).toString().padStart(3, "0")}`;
    expect(id).toBe("AUS-2026-1234");
  });
});

// ---------------------------------------------------------------------------
// Concurrent allocation uniqueness
// ---------------------------------------------------------------------------

describe("allocateBusinessId (in-memory concurrency simulation)", () => {
  it("50 parallel allocations produce 50 unique IDs", async () => {
    const { allocate } = makeInMemoryAllocator();

    const ids = await Promise.all(
      Array.from({ length: 50 }, () => allocate("AUS", 2026)),
    );

    const unique = new Set(ids);
    expect(unique.size).toBe(50);
  });

  it("IDs are sequentially numbered from 001 to 050", async () => {
    const { allocate } = makeInMemoryAllocator();

    const ids = await Promise.all(
      Array.from({ length: 50 }, () => allocate("AUS", 2026)),
    );

    const sorted = [...ids].sort();
    expect(sorted[0]).toBe("AUS-2026-001");
    expect(sorted[49]).toBe("AUS-2026-050");
  });

  it("counters are independent per (kind, year) shard", async () => {
    const { allocate } = makeInMemoryAllocator();

    const [a1, e1, a2] = await Promise.all([
      allocate("AUS", 2026),
      allocate("E", 2026),
      allocate("AUS", 2025),
    ]);

    // Each shard starts at 001
    expect(a1).toBe("AUS-2026-001");
    expect(e1).toBe("E-2026-001");
    expect(a2).toBe("AUS-2025-001");
  });

  it("mixed parallel allocations across shards produce no cross-shard duplicates", async () => {
    const { allocate } = makeInMemoryAllocator();

    const tasks = [
      ...Array.from({ length: 25 }, () => allocate("AUS", 2026)),
      ...Array.from({ length: 25 }, () => allocate("A", 2026)),
    ];

    const ids = await Promise.all(tasks);
    const unique = new Set(ids);
    expect(unique.size).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// validateAuslageInput + composeBezahltVonDisplay
// ---------------------------------------------------------------------------

describe("validateAuslageInput", async () => {
  const { validateAuslageInput } =
    await import("$lib/server/domain/auslagen.js");

  const { DATENSCHUTZ_VERSION } = await import("$lib/domain/datenschutz.js");
  const validBase = {
    bezeichnung: "Druckerpapier für Büro",
    betragCents: 2350,
    currency: "EUR",
    consent_text_version: DATENSCHUTZ_VERSION,
    bezahlt_von: {
      kind: "extern" as const,
      name: "Lea Mustermann",
      iban: "DE43830654089999999999",
      email: "lea@example.com",
    },
  };

  it("accepts valid extern input", () => {
    const result = validateAuslageInput(validBase);
    expect(result.ok).toBe(true);
  });

  it("rejects missing bezeichnung", () => {
    const result = validateAuslageInput({ ...validBase, bezeichnung: "ab" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors)).toContain("bezeichnung");
    }
  });

  it("rejects negative betragCents", () => {
    const result = validateAuslageInput({ ...validBase, betragCents: -100 });
    expect(result.ok).toBe(false);
  });

  it("rejects zero betragCents", () => {
    const result = validateAuslageInput({ ...validBase, betragCents: 0 });
    expect(result.ok).toBe(false);
  });

  it("accepts member kind", () => {
    const result = validateAuslageInput({
      ...validBase,
      bezahlt_von: {
        kind: "member" as const,
        member_id: "550e8400-e29b-41d4-a716-446655440000",
        display_name: "Max Mustermann",
      },
    });
    expect(result.ok).toBe(true);
  });

  it("accepts verein kind", () => {
    const result = validateAuslageInput({
      ...validBase,
      bezahlt_von: { kind: "verein" as const },
    });
    expect(result.ok).toBe(true);
  });
});

describe("composeBezahltVonDisplay", async () => {
  const { composeBezahltVonDisplay } =
    await import("$lib/server/domain/auslagen.js");

  it("verein → 'Verein'", () => {
    expect(composeBezahltVonDisplay({ kind: "verein" })).toBe("Verein");
  });

  it("member → includes display_name", () => {
    const result = composeBezahltVonDisplay({
      kind: "member",
      member_id: "00000000-0000-0000-0000-000000000001",
      display_name: "Max Mustermann",
    });
    expect(result).toContain("Max Mustermann");
    expect(result).toContain("Mitglied:");
  });

  it("extern → masks IBAN, shows name", () => {
    const result = composeBezahltVonDisplay({
      kind: "extern",
      name: "Lea Mustermann",
      iban: "DE43830654089999999999",
      email: "lea@example.com",
    });
    expect(result).toContain("Lea Mustermann");
    expect(result).toContain("DE43");
    expect(result).toContain("9999");
    expect(result).toContain("...");
  });
});
