/**
 * @phase-2 Task 2.11 — MemberBeitragsTimeline pre-join / post-Austritt filter
 * (spec §9 / §17 C5b).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));

import MemberBeitragsTimeline from "./MemberBeitragsTimeline.svelte";

afterEach(() => cleanup());

function row(year: number) {
  return {
    id: `b-${year}`,
    year,
    betragCents: 6969,
    paidCents: 0,
    gezahltAm: null,
    notes: null,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  };
}

describe("MemberBeitragsTimeline — year filter", () => {
  it("hides years before eintrittsJahr", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [row(2022), row(2023), row(2024)],
        memberId: "m1",
        eintrittsJahr: 2023,
      },
    });
    const years = [
      ...container.querySelectorAll('[data-testid="beitragsverlauf-row"]'),
    ].map((el) => el.getAttribute("data-year"));
    expect(years).not.toContain("2022");
    expect(years).toContain("2023");
    expect(years).toContain("2024");
  });

  it("hides years after austrittsJahr", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [row(2023), row(2024), row(2025)],
        memberId: "m1",
        austrittsJahr: 2024,
      },
    });
    const years = [
      ...container.querySelectorAll('[data-testid="beitragsverlauf-row"]'),
    ].map((el) => el.getAttribute("data-year"));
    expect(years).toContain("2023");
    expect(years).toContain("2024");
    expect(years).not.toContain("2025");
  });

  it("shows all years when no bounds given", () => {
    const { container } = render(MemberBeitragsTimeline, {
      props: {
        beitrags: [row(2023), row(2024)],
        memberId: "m1",
      },
    });
    expect(
      container.querySelectorAll('[data-testid="beitragsverlauf-row"]').length,
    ).toBe(2);
  });
});
