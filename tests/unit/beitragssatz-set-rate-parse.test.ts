/**
 * @vitest-environment node
 * @phase-2
 *
 * Review item-4a — the einstellungen/beitraege set-rate action now routes the
 * Betrag through the canonical parseEuroToCents (was replace(",",".")+Number()).
 * The Beitragssatz is the most amount-multiplied value in the app and the server
 * trusts raw form data, so a crafted German-thousands POST must parse correctly,
 * not silently x1000-undercount. Mocks the domain so the cents payload is
 * captured directly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const setBeitragssatz = vi.fn();

vi.mock("$lib/server/domain/beitragssatz-actions.js", () => ({
  setBeitragssatz: (...a: unknown[]) => setBeitragssatz(...a),
}));

// "create" mode checks for an existing satz first; return none so the parse
// path is reached.
vi.mock("$lib/server/db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }),
  }),
}));

function setRateRequest(betrag: string, mode = "update"): Request {
  const fd = new FormData();
  fd.set("year", "2030");
  fd.set("betrag", betrag);
  fd.set("mode", mode);
  return new Request("http://localhost/app/einstellungen/beitraege?/set-rate", {
    method: "POST",
    body: fd,
  });
}

async function runSetRate(betrag: string): Promise<bigint | undefined> {
  const { actions } =
    await import("../../src/routes/app/einstellungen/beitraege/+page.server.js");
  await actions["set-rate"]!({
    request: setRateRequest(betrag),
    locals: { session: { user: { id: "u1", role: "admin" } } },
  } as never);
  if (setBeitragssatz.mock.calls.length === 0) return undefined;
  return (setBeitragssatz.mock.calls[0]![0] as { cents: bigint }).cents;
}

describe("@phase-2 beitraege set-rate — canonical parser routing (item-4a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setBeitragssatz.mockResolvedValue({ ok: true });
  });

  it("German thousands '1.234,56' → 123456 cents (was undercounted)", async () => {
    expect(await runSetRate("1.234,56")).toBe(123456n);
  });

  it("dot-only thousands '1.234' → 123400 cents (NOT 123)", async () => {
    expect(await runSetRate("1.234")).toBe(123400n);
  });

  it("comma decimal '80,00' → 8000 cents", async () => {
    expect(await runSetRate("80,00")).toBe(8000n);
  });

  it("rejects garbage with fail(400) (setBeitragssatz not called)", async () => {
    const { actions } =
      await import("../../src/routes/app/einstellungen/beitraege/+page.server.js");
    const r = (await actions["set-rate"]!({
      request: setRateRequest("abc"),
      locals: { session: { user: { id: "u1", role: "admin" } } },
    } as never)) as { status?: number; data?: { error?: string } };
    expect(setBeitragssatz).not.toHaveBeenCalled();
    expect(r.status).toBe(400);
  });
});
