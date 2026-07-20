import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import StatusTimeline from "./StatusTimeline.svelte";
import type { TimelineEvent } from "./StatusTimeline.svelte";

afterEach(() => cleanup());

const events: TimelineEvent[] = [
  { title: "Eingereicht", timestamp: "01.03.2026", state: "done" },
  { title: "In Prüfung", timestamp: "02.03.2026", state: "now" },
  { title: "Erstattet", state: "pending" },
];

describe("StatusTimeline", () => {
  it("renders one event per entry with title + timestamp", () => {
    render(StatusTimeline, { props: { events } });
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBe(3);
    expect(screen.getByText("Eingereicht")).toBeTruthy();
    expect(screen.getByText("01.03.2026")).toBeTruthy();
  });

  it("carries the per-event state as a data attribute", () => {
    render(StatusTimeline, { props: { events } });
    const nowEvent = screen
      .getByText("In Prüfung")
      .closest('[data-slot="timeline-event"]');
    expect(nowEvent?.getAttribute("data-state")).toBe("now");
  });

  it("invariant: the 'now' dot uses neutral-open, never brand pink (ANDY-LENS §4)", () => {
    render(StatusTimeline, { props: { events } });
    const nowEvent = screen
      .getByText("In Prüfung")
      .closest('[data-slot="timeline-event"]');
    const dot = nowEvent?.querySelector('[data-slot="timeline-dot"]');
    expect(dot?.className).toContain("border-neutral-open");
    expect(dot?.className).not.toMatch(/primary|pink/);
  });

  it("fills done dots with einnahme-green", () => {
    render(StatusTimeline, { props: { events } });
    const doneEvent = screen
      .getByText("Eingereicht")
      .closest('[data-slot="timeline-event"]');
    const dot = doneEvent?.querySelector('[data-slot="timeline-dot"]');
    expect(dot?.className).toContain("bg-type-einnahme");
  });
});
