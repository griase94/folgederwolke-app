/**
 * MemberList — Package D tests.
 *
 * D3: desktop column header "Beitrag {year}" visible above the row list.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));
vi.mock("$app/navigation", () => ({
  invalidateAll: vi.fn().mockResolvedValue(undefined),
}));

import MemberListTest from "./MemberList.test.svelte";
import type { MemberView } from "$lib/domain/members.js";

afterEach(() => cleanup());

const sampleMember: MemberView = {
  id: "mem_1",
  vorname: "Ada",
  nachname: "Lovelace",
  email: "ada@example.com",
  iban: null,
  telefon: null,
  adresse: null,
  dateOfBirth: null,
  role: "mitglied",
  eintrittsDatum: "2020-01-01",
  austrittsDatum: null,
  beitragExempt: false,
  beitragExemptReason: null,
  isFixture: false,
  createdAt: "2020-01-01",
  beitrags: {
    2026: {
      id: "b1",
      betragCents: 6000,
      paidCents: 0,
      gezahltAm: null,
      isExempt: false,
    },
  },
};

describe("MemberList — Package D column header", () => {
  it("renders a desktop column header with testid 'member-list-beitrag-header'", () => {
    const { container } = render(MemberListTest, {
      props: { members: [sampleMember], years: [2026] },
    });
    const header = container.querySelector(
      "[data-testid='member-list-beitrag-header']",
    );
    expect(header).toBeTruthy();
  });

  it("column header shows 'Beitrag' and the current year", () => {
    const { container } = render(MemberListTest, {
      props: { members: [sampleMember], years: [2026] },
    });
    const header = container.querySelector(
      "[data-testid='member-list-beitrag-header']",
    );
    expect(header?.textContent).toMatch(/Beitrag/);
    expect(header?.textContent).toMatch(/2026/);
  });

  it("column header is inside the desktop row-list wrapper (md:block hidden)", () => {
    const { container } = render(MemberListTest, {
      props: { members: [sampleMember], years: [2026] },
    });
    const rowList = container.querySelector('[data-testid="member-row-list"]');
    expect(rowList).toBeTruthy();
    const header = rowList?.querySelector(
      "[data-testid='member-list-beitrag-header']",
    );
    expect(header).toBeTruthy();
  });
});
