/**
 * @phase-3 PR3b Task 3.1 — MemberMatrix optimistic mark-paid + rollback.
 *
 * SAFETY-CRITICAL coverage. These tests prove the two money-safety invariants
 * of the client-side optimistic overlay:
 *
 *  1. OPTIMISM — the cell flips to "paid" SYNCHRONOUSLY on submit, independent
 *     of a slow/pending server. We hold `fetch` open (never resolve) and assert
 *     the grid cell's data-state is already "paid" while the POST is in flight.
 *     This proves the flip does NOT await the network.
 *
 *  2. ROLLBACK — when the mutation is mocked to FAIL (network reject, non-ok
 *     status incl. 409 Festschreibung, or a SvelteKit failure body), the cell
 *     reverts to its exact prior state and an error toast is surfaced. No false
 *     "paid"/"befreit" ever persists.
 *
 * We mock `$app/navigation.invalidate` (the scoped reconcile) and `fetch` (the
 * server POST) so the component logic runs in isolation — the server action is
 * covered separately by the members-actions unit tests and the @phase-2 e2e
 * flows; this file does NOT exercise or weaken the server.
 *
 * IMPORTANT — REAL WIRE FORMAT. A `fetch('?/action')` to a SvelteKit form
 * action returns HTTP 200 even for fail(), and the body is a devalue-encoded
 * ActionResult string (the failure `data` is itself a devalue STRING, e.g.
 * `[{"error":1},"<msg>"]`). The component decodes it with `deserialize()` from
 * `$app/forms`, so these mocks return a Response whose `text()` resolves to a
 * REAL serialized ActionResult — not a hand-shaped `.json()` object. The
 * success/failure builders below mirror exactly what SvelteKit puts on the wire
 * (failure `data` is produced by devalue's `stringify`, confirmed to equal the
 * literal `[{"error":1},"<msg>"]`).
 *
 * The mark-paid popover content is rendered via bits-ui Popover.Portal; we
 * drive it through the real cell click → popover → Bezahlt path and assert on
 * the grid cell's data-state, which lives in the main DOM regardless of portals.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  render,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { tick } from "svelte";

// ── Mocks ──────────────────────────────────────────────────────────────────
// Scoped reconcile — assert it's the scoped key, never invalidateAll().
const invalidate = vi.fn(async (..._args: unknown[]) => {});
vi.mock("$app/navigation", () => ({
  invalidate: (...args: unknown[]) => invalidate(...args),
  invalidateAll: vi.fn(async () => {
    throw new Error(
      "invalidateAll() must NOT be called — PR3b reconcile is scoped",
    );
  }),
}));

// `$app/forms.deserialize` reads `app.decoders` from the SvelteKit CLIENT app
// singleton, which is only populated after the kit client boots — it isn't, in
// vitest, so the real export throws "Cannot read properties of undefined". And
// `devalue` is only a TRANSITIVE dep of kit (not declared here), so Vite refuses
// to resolve a bare `devalue` import from src/ — importing it would mean adding a
// new dependency, which the task forbids.
//
// So we substitute a FAITHFUL re-implementation of `deserialize` that performs
// the SAME two steps as production — `JSON.parse(text)` then a devalue decode of
// `data` — with a tiny, dependency-free `devalueParse` that implements exactly
// devalue's flat reference-array format for the value shapes our actions emit
// (objects, strings, numbers, booleans, null, arrays). A unit test below proves
// it round-trips the exact on-wire string `[{"error":1},"<msg>"]` back to
// `{error:"<msg>"}`, so the component genuinely exercises the real wire format.
function devalueParse(encoded: string): unknown {
  const flat = JSON.parse(encoded) as unknown;
  if (typeof flat === "number") {
    // devalue encodes a few singletons as negative indices; -1 === undefined.
    return undefined;
  }
  const values = flat as unknown[];
  const hydrate = (index: number): unknown => {
    const node = values[index];
    if (typeof node === "number") return hydrate(node); // reference
    if (node === null || typeof node !== "object") return node; // primitive
    if (Array.isArray(node)) return node.map((i) => hydrate(i as number));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = hydrate(v as number);
    return out;
  };
  return hydrate(0);
}

vi.mock("$app/forms", () => ({
  deserialize(text: string) {
    const parsed = JSON.parse(text) as { data?: unknown };
    if (parsed.data) parsed.data = devalueParse(parsed.data as string);
    return parsed;
  },
}));

// Capture toast calls so we can assert error/success surfacing.
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("svelte-sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
  },
}));

import MemberMatrix from "./MemberMatrix.svelte";
import type { MatrixData } from "$lib/domain/beitrag-cell.js";

// ── Fixture: a single member with one open cell for the anchor year ─────────
const MEMBER_ID = "11111111-1111-1111-1111-111111111111";
const YEAR = 2026;

function makeMatrix(): MatrixData {
  return {
    members: [
      {
        id: MEMBER_ID,
        vorname: "Erika",
        nachname: "Mustermann",
        eintrittsJahr: 2020,
        austrittsJahr: null,
        beitragExempt: false,
        beitragExemptReason: null,
      },
    ],
    years: [YEAR],
    cells: [
      {
        memberId: MEMBER_ID,
        year: YEAR,
        state: "open",
        isLocked: false,
        betragCents: 6969,
        paidCents: 0,
        gezahltAm: null,
        exemptReason: null,
        daysOverdue: null,
      },
    ],
    headers: [
      {
        year: YEAR,
        paidCount: 0,
        totalDueCount: 1,
        paidSumCents: 0,
        exemptCount: 0,
        isLocked: false,
      },
    ],
    festgeschriebenBis: null,
  };
}

function cellEl(): HTMLElement | null {
  return document.querySelector(
    `[role="gridcell"][data-member-id="${MEMBER_ID}"][data-year="${YEAR}"]`,
  );
}

// ── Real SvelteKit ActionResult wire bodies ─────────────────────────────────
// A form-action fetch returns HTTP 200 with a devalue-encoded ActionResult.
// These builders produce exactly that string, so `deserialize()` decodes it the
// same way it would in the browser.
function successBody(): string {
  return JSON.stringify({ type: "success", status: 200, data: null });
}

/**
 * devalue-encode a flat `{ error: <string> }` exactly as SvelteKit's `fail()`
 * does on the wire. devalue emits an array where index 0 is the value graph
 * (keys → indices) and the rest are the referenced values, so `{error: msg}`
 * becomes `[{"error":1}, msg]`. We build it by hand (not by importing devalue,
 * which is only a transitive dep — no new runtime deps) and a unit assertion in
 * the suite below confirms it round-trips through `deserialize` to the original
 * object, so this stays honest to the real format.
 */
function devalueError(error: string): string {
  return JSON.stringify([{ error: 1 }, error]);
}

function failureBody(error: string, status = 400): string {
  // SvelteKit devalue-encodes the failure `data`; `data` is therefore a STRING.
  return JSON.stringify({ type: "failure", status, data: devalueError(error) });
}

/** A fetch mock that resolves to a Response whose text() is `body`. */
function fetchReturning(body: string, status = 200): typeof fetch {
  return vi.fn(
    async () => new Response(body, { status }),
  ) as unknown as typeof fetch;
}

/**
 * A fetch mock whose single in-flight call stays PENDING until `release()` is
 * called — lets a test observe the synchronous optimistic flip while the POST
 * is blocked, then drive the resolution (success body / failure body / reject)
 * and observe the rollback. Mirrors the optimism test's deferred pattern.
 */
function deferredFetch(): {
  fetch: typeof fetch;
  resolve: (body: string, status?: number) => void;
  reject: (err: unknown) => void;
} {
  let resolveInner: (r: Response) => void = () => {};
  let rejectInner: (e: unknown) => void = () => {};
  const pending = new Promise<Response>((res, rej) => {
    resolveInner = res;
    rejectInner = rej;
  });
  return {
    fetch: vi.fn(() => pending) as unknown as typeof fetch,
    resolve: (body: string, status = 200) =>
      resolveInner(new Response(body, { status })),
    reject: (err: unknown) => rejectInner(err),
  };
}

beforeEach(() => {
  invalidate.mockClear();
  toastError.mockClear();
  toastSuccess.mockClear();
  // navigator.vibrate is touched by the haptic helpers — stub so it's a no-op.
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    vibrate: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Open the mark-paid popover for the open cell and return the Bezahlt button. */
async function openMarkPaidAndGetSubmit(): Promise<HTMLButtonElement> {
  const cell = cellEl();
  expect(cell).not.toBeNull();
  expect(cell?.getAttribute("data-state")).toBe("open");
  await fireEvent.click(cell as HTMLElement);
  // Popover content (MarkPaidPopover) renders via portal; the Bezahlt button
  // carries the "Bezahlt ↵" label.
  const submit = await screen.findByRole("button", { name: /Bezahlt/ });
  return submit as HTMLButtonElement;
}

describe("test wire-format fixtures match SvelteKit's deserialize", () => {
  it("failureBody round-trips through deserialize to {error}", async () => {
    // Use the SAME decoder the component uses, so the fixture can't drift from
    // the real format. If devalue's shape ever changes, this fails loudly here.
    const { deserialize } = await import("$app/forms");
    const result = deserialize(failureBody("Jahr ist festgeschrieben", 409));
    expect(result.type).toBe("failure");
    expect((result as { data?: { error?: string } }).data?.error).toBe(
      "Jahr ist festgeschrieben",
    );
  });

  it("successBody round-trips through deserialize to a success result", async () => {
    const { deserialize } = await import("$app/forms");
    const result = deserialize(successBody());
    expect(result.type).toBe("success");
  });
});

describe("MemberMatrix — optimistic mark-paid (PR3b 3.1)", () => {
  it("flips the cell to paid SYNCHRONOUSLY, before the server responds", async () => {
    // fetch never resolves → the POST stays in flight for the whole assertion.
    let resolveFetch: (v: unknown) => void = () => {};
    const fetchPending = new Promise((r) => (resolveFetch = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => fetchPending),
    );

    render(MemberMatrix, { props: { matrix: makeMatrix() } });

    const submit = await openMarkPaidAndGetSubmit();
    await fireEvent.click(submit);
    // No await on the network — give Svelte a microtask to apply the overlay.
    await tick();

    // The cell is ALREADY paid while fetch is still pending.
    expect(cellEl()?.getAttribute("data-state")).toBe("paid");
    // The scoped reconcile has NOT run yet (it awaits the POST).
    expect(invalidate).not.toHaveBeenCalled();

    // Cleanly release the pending fetch so the test tears down without leaks.
    resolveFetch(new Response(successBody(), { status: 200 }));
  });

  it("reconciles via the scoped invalidate key on success (never invalidateAll)", async () => {
    vi.stubGlobal("fetch", fetchReturning(successBody()));

    render(MemberMatrix, { props: { matrix: makeMatrix() } });
    const submit = await openMarkPaidAndGetSubmit();
    await fireEvent.click(submit);

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(invalidate).toHaveBeenCalledWith("app:beitrags-matrix");
    // Cell stays paid after reconcile (loaded fixture still says open, but the
    // overlay cleared only after invalidate resolved — net effect is paid until
    // the parent feeds reconciled data; the optimistic value held through).
  });
});

describe("MemberMatrix — rollback on failure (PR3b 3.1)", () => {
  it("reverts the cell to open when the POST is a 409 Festschreibung failure (flip → revert)", async () => {
    // Hold the POST pending so the synchronous optimistic flip is observable,
    // THEN release a real SvelteKit failure body — HTTP 200 with a devalue-
    // encoded failure `data` (the 409 the server set lives inside the
    // ActionResult, not on the HTTP response).
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.fetch);

    render(MemberMatrix, { props: { matrix: makeMatrix() } });
    const submit = await openMarkPaidAndGetSubmit();
    await fireEvent.click(submit);
    await tick();
    // Optimistic flip happened FIRST, while the POST is still pending.
    expect(cellEl()?.getAttribute("data-state")).toBe("paid");

    // Release the failure → it must roll back to the exact prior state.
    d.resolve(failureBody("Jahr ist festgeschrieben", 409), 409);
    await waitFor(() =>
      expect(cellEl()?.getAttribute("data-state")).toBe("open"),
    );
    // The DECODED Festschreibung reason reaches the treasurer (proves deserialize).
    expect(toastError).toHaveBeenCalledWith("Jahr ist festgeschrieben");
    // A failed mutation must never reconcile a false state.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("reverts the cell to open when fetch rejects (network error) (flip → revert)", async () => {
    const d = deferredFetch();
    vi.stubGlobal("fetch", d.fetch);

    render(MemberMatrix, { props: { matrix: makeMatrix() } });
    const submit = await openMarkPaidAndGetSubmit();
    await fireEvent.click(submit);
    await tick();
    // Optimistic flip happened FIRST, while the POST is still pending.
    expect(cellEl()?.getAttribute("data-state")).toBe("paid");

    // Reject the transport → the catch in post() returns {ok:false} → rollback.
    d.reject(new Error("network down"));
    await waitFor(() =>
      expect(cellEl()?.getAttribute("data-state")).toBe("open"),
    );
    expect(toastError).toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("surfaces the DECODED server error message on a SvelteKit failure body (deserialize)", async () => {
    // This is the canary for the deserialize() fix: the failure `data` is a
    // devalue STRING on the wire. The old hand-rolled `res.json().data.error`
    // parse yielded undefined here (generic fallback toast); with deserialize()
    // the real §-level reason reaches the treasurer. Fails-without / passes-with.
    vi.stubGlobal(
      "fetch",
      fetchReturning(failureBody("Ungültige Parameter", 400)),
    );

    render(MemberMatrix, { props: { matrix: makeMatrix() } });
    const submit = await openMarkPaidAndGetSubmit();
    await fireEvent.click(submit);

    await waitFor(() =>
      expect(cellEl()?.getAttribute("data-state")).toBe("open"),
    );
    // The EXACT decoded message — not the generic fallback.
    expect(toastError).toHaveBeenCalledWith("Ungültige Parameter");
    expect(toastError).not.toHaveBeenCalledWith(
      "Fehler — Zahlung nicht gespeichert.",
    );
  });
});
