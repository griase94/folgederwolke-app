/**
 * @phase-aurora-slice4
 * Aufgaben card: buildTaskQueue rendering, v10 mobile Beiträge grouping
 * (one row on mobile, full flat list on desktop), "Heute" context label when
 * selectedYear ≠ berlinYear, empty state, WGB subline rendering.
 *
 * NOTE: the card renders TWO lists — aufgaben-list-mobile (grouped) and
 * aufgaben-list-desktop (flat) — hidden per-breakpoint via CSS. JSDOM has no
 * breakpoints, so both are in the DOM; scope queries with `within(...)`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/svelte";
import AufgabenCard from "./AufgabenCard.svelte";
import type { TaskQueueInput } from "$lib/domain/task-queue.js";

afterEach(() => cleanup());

const NOW = new Date("2026-03-15T12:00:00Z");

function input(over: Partial<TaskQueueInput> = {}): TaskQueueInput {
  return {
    wgb: { status: "ok", einnahmenCents: 0, freigrenzeCents: 5_000_000 },
    openAuslagenCount: 0,
    approvedNotErstattetCount: 0,
    approvedNotErstattetSumCents: 0,
    overdueCount: 0,
    openMemberCount: 0,
    priorYearsUnpaidCount: 0,
    festgeschriebenBis: 2025,
    ...over,
  };
}

const FULL = input({
  openAuslagenCount: 2,
  approvedNotErstattetCount: 1,
  approvedNotErstattetSumCents: 4200,
  overdueCount: 1,
  openMemberCount: 3,
  priorYearsUnpaidCount: 1,
  festgeschriebenBis: 2023,
}); // → 6 tasks

describe("AufgabenCard", () => {
  it("desktop list renders the full queue in tier order with row links + rank1 rail", () => {
    const { container } = render(AufgabenCard, {
      props: { input: FULL, selectedYear: 2026, currentYear: 2026, now: NOW },
    });
    const desktop = container.querySelector(
      "[data-testid='aufgaben-list-desktop']",
    ) as HTMLElement;
    const rows = within(desktop).getAllByTestId("task-row");
    expect(rows.length).toBe(6);
    expect(rows[0]!.getAttribute("data-rail")).toBe("rank1");
  });

  it("mobile list folds the Beiträge tasks into one 'Beiträge offen' row (desktop stays flat)", () => {
    const { container } = render(AufgabenCard, {
      props: { input: FULL, selectedYear: 2026, currentYear: 2026, now: NOW },
    });
    const mobile = container.querySelector(
      "[data-testid='aufgaben-list-mobile']",
    ) as HTMLElement;
    const desktop = container.querySelector(
      "[data-testid='aufgaben-list-desktop']",
    ) as HTMLElement;
    // FULL → 3 non-Beiträge tasks (Belege, Erstattung, Jahresabschluss) + the
    // 3 Beiträge summaries folded into ONE grouped row = 4 mobile rows.
    expect(within(mobile).getAllByTestId("task-row").length).toBe(4);
    expect(within(desktop).getAllByTestId("task-row").length).toBe(6);
    expect(
      within(mobile).getAllByText("Beiträge offen").length,
    ).toBeGreaterThan(0);
  });

  it("shows the 'Heute' context label only when selectedYear ≠ currentYear", () => {
    const { unmount } = render(AufgabenCard, {
      props: { input: FULL, selectedYear: 2025, currentYear: 2026, now: NOW },
    });
    expect(screen.getByTestId("aufgaben-heute-chip")).toBeTruthy();
    unmount();
    render(AufgabenCard, {
      props: { input: FULL, selectedYear: 2026, currentYear: 2026, now: NOW },
    });
    expect(screen.queryByTestId("aufgaben-heute-chip")).toBeNull();
  });

  it("empty state: one collapsed row with the exact wording", () => {
    render(AufgabenCard, {
      props: {
        input: input(),
        selectedYear: 2026,
        currentYear: 2026,
        now: NOW,
      },
    });
    expect(
      screen.getByText("Alles erledigt — nichts wartet auf dich."),
    ).toBeTruthy();
    expect(screen.queryAllByTestId("task-row")).toHaveLength(0);
  });

  it("renders the WGB subline under the pinned critical row", () => {
    render(AufgabenCard, {
      props: {
        input: input({
          wgb: {
            status: "ueberschritten",
            einnahmenCents: 5_100_000,
            freigrenzeCents: 5_000_000,
          },
        }),
        selectedYear: 2026,
        currentYear: 2026,
        now: NOW,
      },
    });
    // rendered in both the mobile and desktop lists (CSS hides one per breakpoint).
    expect(
      screen.getAllByText("Sphären-Zuordnung der Buchungen prüfen").length,
    ).toBeGreaterThan(0);
  });
});
