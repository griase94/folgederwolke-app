/**
 * Audit-log hash-chain trigger + verifier unit tests.  @phase-7.5
 *
 * The trigger itself runs in PL/pgSQL — we don't spin up Postgres in unit
 * tests. Instead we:
 *
 *   1. Test the TS recipe (chain.ts → computeRowHash) for deterministic
 *      output. This is the contract the trigger SQL must match.
 *   2. Test the verifier against a *simulated* `audit_log` execute response:
 *      it must accept a well-formed chain and reject every flavor of tamper
 *      (modified payload → row_hash mismatch; broken prev_hash linkage;
 *      reordered rows).
 *
 * Integration-grade verification (real trigger + real PG) is covered by a
 * pre-deploy migration smoke test, NOT here.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

import {
  computeRowHash,
  formatOccurredAtForHash,
  NULL_MARKER,
} from "$lib/server/audit-log/chain.js";

// ---------------------------------------------------------------------------
// 1. Recipe / formatter unit tests — pure functions, no mocks
// ---------------------------------------------------------------------------

describe("formatOccurredAtForHash", () => {
  it("formats UTC with microsecond zero-padding", () => {
    // 2026-05-19T03:14:15.926Z — ms-precision Date → 926000 us in output
    const d = new Date(Date.UTC(2026, 4, 19, 3, 14, 15, 926));
    expect(formatOccurredAtForHash(d)).toBe("2026-05-19T03:14:15.926000");
  });

  it("pads single-digit fields", () => {
    const d = new Date(Date.UTC(2026, 0, 5, 1, 2, 3, 4));
    expect(formatOccurredAtForHash(d)).toBe("2026-01-05T01:02:03.004000");
  });
});

describe("computeRowHash", () => {
  const baseInput = {
    prevHash: "",
    actorUserId: "00000000-0000-0000-0000-000000000001",
    action: "create",
    entityKind: "member",
    entityId: "11111111-1111-1111-1111-111111111111",
    occurredAt: new Date(Date.UTC(2026, 4, 19, 3, 14, 15, 0)),
    payloadCanonical: "{}",
  };

  function expectedHash(input: typeof baseInput): string {
    const parts = [
      input.prevHash ?? "",
      input.actorUserId ?? NULL_MARKER,
      input.action,
      input.entityKind,
      input.entityId ?? NULL_MARKER,
      formatOccurredAtForHash(input.occurredAt),
      input.payloadCanonical,
    ];
    return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
  }

  it("matches the documented recipe byte-for-byte", () => {
    expect(computeRowHash(baseInput)).toBe(expectedHash(baseInput));
  });

  it("serializes NULL actor / entity as the Postgres '\\N' marker", () => {
    const hash = computeRowHash({
      ...baseInput,
      actorUserId: null,
      entityId: null,
    });
    // Hash must differ from baseInput AND must use '\N' (not 'null') in concat.
    expect(hash).not.toBe(computeRowHash(baseInput));
    const expected = createHash("sha256")
      .update(
        [
          "",
          "\\N",
          "create",
          "member",
          "\\N",
          "2026-05-19T03:14:15.000000",
          "{}",
        ].join("|"),
        "utf8",
      )
      .digest("hex");
    expect(hash).toBe(expected);
  });

  it("changes when payload changes (tamper-evidence on payload)", () => {
    const h1 = computeRowHash({ ...baseInput, payloadCanonical: '{"a": 1}' });
    const h2 = computeRowHash({ ...baseInput, payloadCanonical: '{"a": 2}' });
    expect(h1).not.toBe(h2);
  });

  it("changes when prev_hash changes (links the chain)", () => {
    const h1 = computeRowHash({ ...baseInput, prevHash: "abc" });
    const h2 = computeRowHash({ ...baseInput, prevHash: "def" });
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// 2. Verifier tests — mock the db execute() to return a synthetic chain
// ---------------------------------------------------------------------------

const mockExecute = vi.fn();

vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    execute: mockExecute,
  }),
}));

// drizzle-orm `sql` tag pass-through — we only inspect what the verifier
// passes (we don't run real SQL).
vi.mock("drizzle-orm", async () => {
  return {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
  };
});

const { verifyAuditChain } = await import("$lib/server/audit-log/verifier.js");

interface FakeRow {
  id: string;
  chain_seq: number;
  prev_hash: string | null;
  row_hash: string | null;
  actor_user_id: string | null;
  action: string;
  entity_kind: string;
  entity_id: string | null;
  occurred_at: Date;
  payload_canonical: string;
}

/** Build a valid chain of N rows where each row_hash is computed per the recipe. */
function buildValidChain(
  n: number,
  baseTime = Date.UTC(2026, 4, 19, 0, 0, 0),
): FakeRow[] {
  const rows: FakeRow[] = [];
  let prevHash = "";
  for (let i = 1; i <= n; i++) {
    const occurred_at = new Date(baseTime + i * 1000);
    const actor_user_id = `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
    const entity_id = `11111111-1111-1111-1111-${String(i).padStart(12, "0")}`;
    const payload_canonical = `{"i": ${i}}`;
    const parts = [
      prevHash,
      actor_user_id,
      "create",
      "member",
      entity_id,
      formatOccurredAtForHash(occurred_at),
      payload_canonical,
    ];
    const row_hash = createHash("sha256")
      .update(parts.join("|"), "utf8")
      .digest("hex");
    rows.push({
      id: `aaaaaaaa-aaaa-aaaa-aaaa-${String(i).padStart(12, "0")}`,
      chain_seq: i,
      prev_hash: prevHash,
      row_hash,
      actor_user_id,
      action: "create",
      entity_kind: "member",
      entity_id,
      occurred_at,
      payload_canonical,
    });
    prevHash = row_hash;
  }
  return rows;
}

function mockChainResponse(rows: FakeRow[], preGenesis = 0) {
  // The verifier issues two `db.execute` calls:
  //   1. COUNT(*) of pre-genesis (chain_seq IS NULL)
  //   2. The chain walk
  mockExecute.mockReset();
  mockExecute.mockResolvedValueOnce([{ n: preGenesis }]);
  mockExecute.mockResolvedValueOnce(rows);
}

beforeEach(() => {
  mockExecute.mockReset();
});

describe("verifyAuditChain — happy path", () => {
  it("returns ok=true for a well-formed chain", async () => {
    mockChainResponse(buildValidChain(5));
    const result = await verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(5);
    expect(result.breaks).toEqual([]);
    expect(result.head).toBe(5);
    expect(result.preGenesisSkipped).toBe(0);
  });

  it("reports pre-genesis count without including them in checks", async () => {
    mockChainResponse(buildValidChain(3), 7);
    const result = await verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.preGenesisSkipped).toBe(7);
    expect(result.rowsChecked).toBe(3);
  });

  it("handles an empty chain (genesis case)", async () => {
    mockChainResponse([]);
    const result = await verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(0);
    expect(result.head).toBeNull();
  });
});

describe("verifyAuditChain — tamper detection", () => {
  it("detects payload mutation (row_hash mismatch)", async () => {
    const chain = buildValidChain(5);
    // Attacker rewrites payload of row 3 but doesn't (or can't) recompute hash.
    chain[2]!.payload_canonical = '{"i": 999}';
    mockChainResponse(chain);
    const result = await verifyAuditChain();
    expect(result.ok).toBe(false);
    expect(result.breaks.some((b) => b.kind === "row_hash_mismatch")).toBe(
      true,
    );
    expect(
      result.breaks.find((b) => b.kind === "row_hash_mismatch")?.chainSeq,
    ).toBe(3);
  });

  it("detects broken prev_hash linkage (row deletion / reorder)", async () => {
    const chain = buildValidChain(5);
    // Attacker deletes row 3 but leaves the rest of the chain referencing
    // the original prev_hash on row 4 — link is broken.
    const tampered = [chain[0]!, chain[1]!, chain[3]!, chain[4]!];
    // Re-number chain_seq so the verifier's loop still iterates (it iterates
    // by array order, not by reading chain_seq).
    tampered[2]!.chain_seq = 3;
    tampered[3]!.chain_seq = 4;
    mockChainResponse(tampered);
    const result = await verifyAuditChain();
    expect(result.ok).toBe(false);
    expect(result.breaks.some((b) => b.kind === "prev_hash_mismatch")).toBe(
      true,
    );
  });

  it("detects a forged row_hash that doesn't match the recipe", async () => {
    const chain = buildValidChain(3);
    chain[1]!.row_hash = "deadbeef".repeat(8); // 64-hex but wrong
    mockChainResponse(chain);
    const result = await verifyAuditChain();
    expect(result.ok).toBe(false);
    // Both the local row_hash AND the next row's prev_hash linkage break.
    const kinds = result.breaks.map((b) => b.kind);
    expect(kinds).toContain("row_hash_mismatch");
  });

  it("detects when row_hash is NULL on a chained row", async () => {
    const chain = buildValidChain(3);
    chain[1]!.row_hash = null;
    mockChainResponse(chain);
    const result = await verifyAuditChain();
    expect(result.ok).toBe(false);
  });
});
