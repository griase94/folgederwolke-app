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
    resolveFetch(
      new Response(JSON.stringify({ type: "success" }), { status: 200 }),
    );
  });

  it("reconciles via the scoped invalidate key on success (never invalidateAll)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ type: "success" }), { status: 200 }),
      ),
    );

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
  it("reverts the cell to open when the POST returns a non-ok (409 Festschreibung)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: { error: "Jahr ist festgeschrieben" } }),
            {
              status: 409,
            },
          ),
      ),
    );

    render(MemberMatrix, { props: { matrix: makeMatrix() } });
    const submit = await openMarkPaidAndGetSubmit();
    await fireEvent.click(submit);
    await tick();
    // Optimistic flip happened first…
    expect(cellEl()?.getAttribute("data-state")).toBe("paid");

    // …then the 409 rolls it back to the exact prior state.
    await waitFor(() =>
      expect(cellEl()?.getAttribute("data-state")).toBe("open"),
    );
    expect(toastError).toHaveBeenCalled();
    // A failed mutation must never reconcile a false state.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("reverts the cell to open when fetch rejects (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    render(MemberMatrix, { props: { matrix: makeMatrix() } });
    const submit = await openMarkPaidAndGetSubmit();
    await fireEvent.click(submit);

    await waitFor(() =>
      expect(cellEl()?.getAttribute("data-state")).toBe("open"),
    );
    expect(toastError).toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("surfaces the server error message on a SvelteKit failure body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "failure",
              data: { error: "Ungültige Parameter" },
            }),
            { status: 200 },
          ),
      ),
    );

    render(MemberMatrix, { props: { matrix: makeMatrix() } });
    const submit = await openMarkPaidAndGetSubmit();
    await fireEvent.click(submit);

    await waitFor(() =>
      expect(cellEl()?.getAttribute("data-state")).toBe("open"),
    );
    expect(toastError).toHaveBeenCalledWith("Ungültige Parameter");
  });
});
