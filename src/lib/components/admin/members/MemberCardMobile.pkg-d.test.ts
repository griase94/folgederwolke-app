/**
 * MemberCardMobile — Package D tests.
 *
 * D2: use resolveBeitragState resolver + BeitragStatusPill;
 *     partial state shows fraction pill; exempt shows exempt pill.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/svelte";

vi.mock("$app/forms", () => ({
  enhance: () => ({ destroy: () => {} }),
}));
vi.mock("$app/navigation", () => ({
  invalidateAll: vi.fn().mockResolvedValue(undefined),
}));

import MemberCardMobile from "./MemberCardMobile.svelte";
import type { MemberView } from "$lib/domain/members.js";

afterEach(() => cleanup());

function makeMember(overrides: Partial<MemberView> = {}): MemberView {
  return {
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
      },
    },
    ...overrides,
  };
}

describe("MemberCardMobile — Package D", () => {
  it("renders a BeitragStatusPill (data-testid=beitrag-status-pill)", () => {
    const { container } = render(MemberCardMobile, {
      props: {
        member: makeMember(),
        years: [2026],
        satzByYear: { 2026: 6000 },
      },
    });
    const pill = container.querySelector("[data-testid='beitrag-status-pill']");
    expect(pill).toBeTruthy();
  });

  it("paid state: shows emerald paid pill", () => {
    const member = makeMember({
      beitrags: {
        2026: {
          id: "b1",
          betragCents: 6000,
          paidCents: 6000,
          gezahltAm: "2026-02-01",
        },
      },
    });
    const { container } = render(MemberCardMobile, {
      props: { member, years: [2026], satzByYear: { 2026: 6000 } },
    });
    const pill = container.querySelector("[data-state='paid']");
    expect(pill).toBeTruthy();
    expect(pill!.className).toMatch(/emerald/);
  });

  it("partial state: shows partial pill with fraction", () => {
    const member = makeMember({
      beitrags: {
        2026: {
          id: "b1",
          betragCents: 6000,
          paidCents: 3000,
          gezahltAm: "2026-02-01",
        },
      },
    });
    const { container } = render(MemberCardMobile, {
      props: { member, years: [2026], satzByYear: { 2026: 6000 } },
    });
    const pill = container.querySelector("[data-state='partial']");
    expect(pill).toBeTruthy();
  });

  it("exempt member: shows exempt pill, no pay trigger", () => {
    const member = makeMember({ beitragExempt: true, beitrags: {} });
    const { container } = render(MemberCardMobile, {
      props: { member, years: [2026], satzByYear: { 2026: 6000 } },
    });
    const pill = container.querySelector("[data-testid='beitrag-status-pill']");
    expect(pill).toBeTruthy();
    const payBtn = container.querySelector("[data-testid='member-card-pay']");
    expect(payBtn).toBeFalsy();
  });

  it("open state: shows pay trigger button", () => {
    const { container } = render(MemberCardMobile, {
      props: {
        member: makeMember(),
        years: [2026],
        satzByYear: { 2026: 6000 },
      },
    });
    const payBtn = container.querySelector("[data-testid='member-card-pay']");
    expect(payBtn).toBeTruthy();
  });

  it("paid state: no pay trigger shown", () => {
    const member = makeMember({
      beitrags: {
        2026: {
          id: "b1",
          betragCents: 6000,
          paidCents: 6000,
          gezahltAm: "2026-02-01",
        },
      },
    });
    const { container } = render(MemberCardMobile, {
      props: { member, years: [2026], satzByYear: { 2026: 6000 } },
    });
    const payBtn = container.querySelector("[data-testid='member-card-pay']");
    expect(payBtn).toBeFalsy();
  });
});
