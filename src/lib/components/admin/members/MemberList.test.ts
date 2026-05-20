/**
 * @phase-7 C7 — MemberList mobile card variant (PM-009)
 *
 * Asserts the responsive split between the mobile card list and the
 * desktop row list.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
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
  role: "member",
  eintrittsDatum: "2025-01-15",
  austrittsDatum: null,
  isFixture: false,
  createdAt: "2025-01-15",
  beitrags: {
    2026: { id: "b1", betragCents: 5000, paidCents: 5000, gezahltAm: "2026-02-01" },
  },
};

describe("MemberList — mobile card variant (PM-009)", () => {
  it("renders the mobile card-list wrapper at md-hidden", () => {
    const { container } = render(MemberListTest, {
      props: { members: [sampleMember], years: [2026] },
    });
    const cardList = container.querySelector(
      '[data-testid="member-card-list"]',
    );
    expect(cardList).toBeTruthy();
    expect(cardList!.className).toMatch(/md:hidden/);
  });

  it("renders the desktop row-list wrapper as hidden md:block", () => {
    const { container } = render(MemberListTest, {
      props: { members: [sampleMember], years: [2026] },
    });
    const rowList = container.querySelector(
      '[data-testid="member-row-list"]',
    );
    expect(rowList).toBeTruthy();
    expect(rowList!.className).toMatch(/hidden/);
    expect(rowList!.className).toMatch(/md:block/);
  });

  it("renders one member-card per member in the mobile list", () => {
    const { container } = render(MemberListTest, {
      props: {
        members: [sampleMember, { ...sampleMember, id: "mem_2" }],
        years: [2026],
      },
    });
    const cards = container.querySelectorAll('[data-testid="member-card"]');
    expect(cards.length).toBe(2);
  });
});
