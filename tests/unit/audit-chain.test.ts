/**
 * Audit-log hash-chain trigger + verifier unit tests.  @phase-7.5 @recipe-v2
 *
 * The trigger itself runs in PL/pgSQL — we don't spin up Postgres in unit
 * tests. Instead we:
 *
 *   1. Test the TS recipe (chain.ts → computeRowHash) for deterministic
 *      output. This is the contract the trigger SQL must match.
 *   2. Test the verifier against a *simulated* `audit_log` execute response:
 *      it must accept a well-formed chain and reject every flavor of tamper
 *      (modified payload → row_hash mismatch; broken prev_hash linkage;
 *      reordered rows; suffix truncation flagged via persisted head).
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
  it("formats UTC with millisecond precision (v2)", () => {
    // v1 used 6-digit microseconds; the SQL trigger truncates to ms now so
    // the two sides agree (schema review CRIT-F1, 2026-05-19).
    const d = new Date(Date.UTC(2026, 4, 19, 3, 14, 15, 926));
    expect(formatOccurredAtForHash(d)).toBe("2026-05-19T03:14:15.926");
  });

  it("pads single-digit fields and ms", () => {
    const d = new Date(Date.UTC(2026, 0, 5, 1, 2, 3, 4));
    expect(formatOccurredAtForHash(d)).toBe("2026-01-05T01:02:03.004");
  });
});

describe("computeRowHash", () => {
  const baseInput = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    chainSeq: 1,
    prevHash: "",
    actorUserId: "00000000-0000-0000-0000-000000000001",
    actorKind: "user",
    actorIpPrefix: "203.0.113.0/24",
    actorUaHash: "deadbeef",
    action: "create",
    entityKind: "member",
    entityId: "11111111-1111-1111-1111-111111111111",
    entityBusinessId: "MIT-2026-001",
    occurredAt: new Date(Date.UTC(2026, 4, 19, 3, 14, 15, 0)),
    payloadCanonical: "{}",
  };

  function expectedHash(input: typeof baseInput): string {
    const parts = [
      input.prevHash,
      input.id,
      String(input.chainSeq),
      input.actorUserId ?? NULL_MARKER,
      input.actorKind ?? NULL_MARKER,
      input.actorIpPrefix ?? NULL_MARKER,
      input.actorUaHash ?? NULL_MARKER,
      input.action,
      input.entityKind,
      input.entityId ?? NULL_MARKER,
      input.entityBusinessId ?? NULL_MARKER,
      formatOccurredAtForHash(input.occurredAt),
      input.payloadCanonical,
    ];
    return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
  }

  it("matches the documented v2 recipe byte-for-byte", () => {
    expect(computeRowHash(baseInput)).toBe(expectedHash(baseInput));
  });

  it("serializes NULL fields as the Postgres '\\N' marker", () => {
    const hash = computeRowHash({
      ...baseInput,
      actorUserId: null,
      actorKind: null,
      actorIpPrefix: null,
      actorUaHash: null,
      entityId: null,
      entityBusinessId: null,
    });
    // Hash must differ from baseInput AND must use '\N' (not 'null') in concat.
    expect(hash).not.toBe(computeRowHash(baseInput));
    const expected = createHash("sha256")
      .update(
        [
          "",
          baseInput.id,
          "1",
          "\\N",
          "\\N",
          "\\N",
          "\\N",
          "create",
          "member",
          "\\N",
          "\\N",
          "2026-05-19T03:14:15.000",
          "{}",
        ].join("|"),
        "utf8",
      )
      .digest("hex");
    expect(hash).toBe(expected);
  });

  // v2 tamper-evidence: each newly-hashed column must move the hash when
  // changed in isolation. These tests are the regression net for the CRIT-01
  // finding ("hash recipe missing actor_kind / ip_prefix / business_id / id").
  it.each([
    ["id", { id: "cafecafe-cafe-cafe-cafe-cafecafecafe" }],
    ["chainSeq", { chainSeq: 99 }],
    ["actorKind", { actorKind: "system" }],
    ["actorIpPrefix", { actorIpPrefix: "198.51.100.0/24" }],
    ["actorUaHash", { actorUaHash: "feedface" }],
    ["entityBusinessId", { entityBusinessId: "AUS-2026-007" }],
  ])(
    "hash changes when only %s changes (CRIT-01 regression net)",
    (_field, patch) => {
      const before = computeRowHash(baseInput);
      const after = computeRowHash({ ...baseInput, ...patch });
      expect(after).not.toBe(before);
    },
  );

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
  actor_kind: string | null;
  actor_ip_prefix: string | null;
  actor_ua_hash: string | null;
  action: string;
  entity_kind: string;
  entity_id: string | null;
  entity_business_id: string | null;
  occurred_at: Date;
  payload_canonical: string;
}

/** Build a valid chain of N rows where each row_hash is computed per the v2 recipe. */
function buildValidChain(
  n: number,
  baseTime = Date.UTC(2026, 4, 19, 0, 0, 0),
): FakeRow[] {
  const rows: FakeRow[] = [];
  let prevHash = "";
  for (let i = 1; i <= n; i++) {
    const occurred_at = new Date(baseTime + i * 1000);
    const id = `aaaaaaaa-aaaa-aaaa-aaaa-${String(i).padStart(12, "0")}`;
    const actor_user_id = `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`;
    const entity_id = `11111111-1111-1111-1111-${String(i).padStart(12, "0")}`;
    const payload_canonical = `{"i": ${i}}`;
    const actor_kind = "user";
    const actor_ip_prefix = "203.0.113.0/24";
    const actor_ua_hash = "deadbeef";
    const entity_business_id = `MIT-2026-${String(i).padStart(3, "0")}`;
    const parts = [
      prevHash,
      id,
      String(i),
      actor_user_id,
      actor_kind,
      actor_ip_prefix,
      actor_ua_hash,
      "create",
      "member",
      entity_id,
      entity_business_id,
      formatOccurredAtForHash(occurred_at),
      payload_canonical,
    ];
    const row_hash = createHash("sha256")
      .update(parts.join("|"), "utf8")
      .digest("hex");
    rows.push({
      id,
      chain_seq: i,
      prev_hash: prevHash,
      row_hash,
      actor_user_id,
      actor_kind,
      actor_ip_prefix,
      actor_ua_hash,
      action: "create",
      entity_kind: "member",
      entity_id,
      entity_business_id,
      occurred_at,
      payload_canonical,
    });
    prevHash = row_hash;
  }
  return rows;
}

/**
 * Mock the three SELECTs the v2 verifier issues, in order:
 *   1. COUNT(*) of pre-genesis rows
 *   2. SELECT chain_seq from settings.audit_chain_last_head
 *   3. The chain walk itself
 */
function mockChainResponse(
  rows: FakeRow[],
  opts: { preGenesis?: number; persistedHead?: number | null } = {},
) {
  const preGenesis = opts.preGenesis ?? 0;
  const persistedHead =
    opts.persistedHead ??
    (rows.length > 0 ? (rows[rows.length - 1]?.chain_seq ?? null) : null);
  mockExecute.mockReset();
  mockExecute.mockResolvedValueOnce([{ n: preGenesis }]);
  mockExecute.mockResolvedValueOnce([{ chain_seq: persistedHead }]);
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
    expect(result.persistedHead).toBe(5);
    expect(result.preGenesisSkipped).toBe(0);
  });

  it("reports pre-genesis count without including them in checks", async () => {
    mockChainResponse(buildValidChain(3), { preGenesis: 7 });
    const result = await verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.preGenesisSkipped).toBe(7);
    expect(result.rowsChecked).toBe(3);
  });

  it("handles an empty chain (genesis case)", async () => {
    mockChainResponse([], { persistedHead: 0 });
    const result = await verifyAuditChain();
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(0);
    expect(result.head).toBeNull();
  });
});

describe("verifyAuditChain — tamper detection", () => {
  it("detects payload mutation (row_hash mismatch)", async () => {
    const chain = buildValidChain(5);
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
    const tampered = [chain[0]!, chain[1]!, chain[3]!, chain[4]!];
    tampered[2]!.chain_seq = 3;
    tampered[3]!.chain_seq = 4;
    mockChainResponse(tampered, { persistedHead: 5 });
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

  // v2 truncation-detection (audit-chain CRIT-04). An attacker who can
  // DELETE rows can leave a chain that internally validates but is shorter
  // than the persisted head. The verifier flags this distinct break.
  it("detects suffix truncation (table head < persisted head)", async () => {
    const chain = buildValidChain(3);
    mockChainResponse(chain, { persistedHead: 5 });
    const result = await verifyAuditChain();
    expect(result.ok).toBe(false);
    const trunc = result.breaks.find(
      (b) => b.kind === "table_head_below_persisted",
    );
    expect(trunc).toBeDefined();
    expect(trunc?.stored).toBe("3");
    expect(trunc?.expected).toBe("5");
  });

  it("detects total chain wipe (table empty, persisted head > 0)", async () => {
    mockChainResponse([], { persistedHead: 42 });
    const result = await verifyAuditChain();
    expect(result.ok).toBe(false);
    const trunc = result.breaks.find(
      (b) => b.kind === "table_head_below_persisted",
    );
    expect(trunc?.stored).toBeNull();
    expect(trunc?.expected).toBe("42");
  });
});
