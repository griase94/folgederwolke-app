/**
 * @phase-aurora-slice4
 * Aufgaben card: buildTaskQueue rendering, mobile cap 4 + "Alle N Aufgaben"
 * expander, "Heute" context label when selectedYear ≠ berlinYear, empty
 * state, WGB subline rendering.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
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
  it("renders the queue in order with row links", () => {
    render(AufgabenCard, {
      props: { input: FULL, selectedYear: 2026, currentYear: 2026, now: NOW },
    });
    const rows = screen.getAllByTestId("task-row");
    expect(rows.length).toBe(6);
    expect(rows[0]!.getAttribute("data-rail")).toBe("rank1");
  });

  it("mobile cap: rows 5+ get hidden md:block before expansion; expander reveals them", async () => {
    const { container } = render(AufgabenCard, {
      props: { input: FULL, selectedYear: 2026, currentYear: 2026, now: NOW },
    });
    const items = container.querySelectorAll("[data-testid='task-item']");
    expect(items[4]!.className).toContain("hidden");
    expect(items[4]!.className).toContain("md:block");
    await fireEvent.click(
      screen.getByRole("button", { name: "Alle 6 Aufgaben" }),
    );
    for (const li of container.querySelectorAll("[data-testid='task-item']")) {
      expect(li.className).not.toContain("hidden");
    }
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
    expect(
      screen.getByText("Sphären-Zuordnung der Buchungen prüfen"),
    ).toBeTruthy();
  });
});
