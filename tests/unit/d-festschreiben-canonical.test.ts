// @vitest-environment node
/**
 * D-S3 — the irreversible act. Two guards live here:
 *
 * 1. REGRESSION "kanonische Action archiviert": the ONE festschreiben action
 *    (on [year]/+page.server.ts) must archive Phase-9 files BEFORE it closes
 *    the books. This is the fix for the verified prod bug where a second,
 *    divergent action on uebersicht/+page.server.ts closed WITHOUT archiving.
 *    If someone re-introduces a close-without-archive path, this test fails.
 *
 * 2. GREP-GUARD: there must be exactly ONE `festschreiben:` action in the whole
 *    route tree, and the deleted FestschreibungConfirm.svelte must stay gone.
 *    A second festschreiben action = the divergence bug is back.
 *
 * Plus the guard matrix (future year → 409, not authed → 401, bad year → 400).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// ── Mocks: archive + close + current-year anchor ────────────────────────────
const archiveYear = vi.fn(async () => ({ archived: 3, failed: 0, total: 3 }));
const closeBuchhaltungsjahr = vi.fn(async (year: number) => ({
  year,
  totalRows: 152,
  rowsByTable: { income: 94, expenses: 46, donations: 12 },
}));
const berlinYear = vi.fn(() => 2026);

vi.mock("$lib/server/files/archive-job.js", () => ({
  archiveYear: (...args: unknown[]) => archiveYear(...(args as [])),
}));
vi.mock("$lib/server/domain/jahresabschluss.js", () => ({
  closeBuchhaltungsjahr: (...args: unknown[]) =>
    closeBuchhaltungsjahr(...(args as [number])),
}));
vi.mock("$lib/domain/year.js", () => ({
  berlinYear: () => berlinYear(),
}));

// The canonical action module.
import { actions } from "../../src/routes/app/jahresabschluss/[year]/+page.server.ts";

if (!actions.festschreiben) {
  throw new Error("canonical festschreiben action missing from [year] route");
}
const festschreiben = actions.festschreiben;

type ActionEvent = Parameters<typeof festschreiben>[0];

function evt(year: string, userId: string | null = "u-1"): ActionEvent {
  return {
    params: { year },
    locals: {
      session: userId ? { user: { id: userId } } : undefined,
    },
  } as unknown as ActionEvent;
}

beforeEach(() => {
  archiveYear.mockClear();
  closeBuchhaltungsjahr.mockClear();
  berlinYear.mockClear();
});

describe("canonical festschreiben action archives before closing", () => {
  it("archives Phase-9 files, THEN closes — in that order", async () => {
    const res = await festschreiben(evt("2024"));

    expect(archiveYear).toHaveBeenCalledTimes(1);
    expect(archiveYear).toHaveBeenCalledWith(2024);
    expect(closeBuchhaltungsjahr).toHaveBeenCalledTimes(1);
    expect(closeBuchhaltungsjahr).toHaveBeenCalledWith(2024, "u-1");

    // Order: archive must run before close (the bug was close-without-archive).
    expect(archiveYear.mock.invocationCallOrder[0]).toBeLessThan(
      closeBuchhaltungsjahr.mock.invocationCallOrder[0]!,
    );

    // Result surfaces the archive counters for the Hub-Settle warn path.
    expect(res).toMatchObject({
      success: true,
      year: 2024,
      totalRows: 152,
      archived: 3,
      archiveFailed: 0,
      archiveTotal: 3,
    });
    // beitragCount (paid Mitgliedsbeiträge, protected by the Jahressperre) is
    // surfaced for the Settle breakdown „N geschützt (M versiegelt, K Beiträge)".
    expect(typeof (res as { beitragCount: number }).beitragCount).toBe(
      "number",
    );
  });

  it("surfaces a partial archive failure without swallowing it", async () => {
    archiveYear.mockResolvedValueOnce({ archived: 2, failed: 1, total: 3 });
    const res = (await festschreiben(evt("2024"))) as {
      archiveFailed: number;
    };
    expect(res.archiveFailed).toBe(1);
    // Close still runs — a partial archive failure doesn't block the seal.
    expect(closeBuchhaltungsjahr).toHaveBeenCalledTimes(1);
  });

  it("blocks the current/future year with a friendly 409 (no archive, no close)", async () => {
    const res = (await festschreiben(evt("2026"))) as {
      status: number;
    };
    expect(res.status).toBe(409);
    expect(archiveYear).not.toHaveBeenCalled();
    expect(closeBuchhaltungsjahr).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller with 401", async () => {
    const res = (await festschreiben(evt("2024", null))) as {
      status: number;
    };
    expect(res.status).toBe(401);
    expect(closeBuchhaltungsjahr).not.toHaveBeenCalled();
  });

  it("rejects an invalid year with 400", async () => {
    const res = (await festschreiben(evt("nope"))) as {
      status: number;
    };
    expect(res.status).toBe(400);
    expect(archiveYear).not.toHaveBeenCalled();
  });
});

describe("grep-guard: exactly one festschreiben action, divergence stays fixed", () => {
  const repoRoot = resolve(__dirname, "..", "..");
  const routesDir = resolve(repoRoot, "src", "routes");

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) yield* walk(full);
      else if (entry === "+page.server.ts" || entry === "+server.ts")
        yield full;
    }
  }

  it("only [year]/+page.server.ts declares a `festschreiben:` action", () => {
    const offenders: string[] = [];
    let canonicalFound = false;
    for (const file of walk(routesDir)) {
      const src = readFileSync(file, "utf8");
      if (!/\bfestschreiben\s*:/.test(src)) continue;
      const rel = file.split("src/routes/")[1] ?? file;
      if (rel === "app/jahresabschluss/[year]/+page.server.ts") {
        canonicalFound = true;
      } else {
        offenders.push(rel);
      }
    }
    expect(canonicalFound).toBe(true);
    // A second festschreiben action anywhere = the archive-divergence bug is back.
    expect(offenders).toEqual([]);
  });

  it("the divergent FestschreibungConfirm component stays deleted", () => {
    const p = resolve(
      repoRoot,
      "src/lib/components/admin/jahresabschluss/FestschreibungConfirm.svelte",
    );
    expect(() => statSync(p)).toThrow();
  });
});
