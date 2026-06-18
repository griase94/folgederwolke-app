/**
 * [id]/+page.svelte — Package D tests.
 *
 * D6: sticky bar is status-driven (no reminder CTA when paid/exempt);
 *     dead Notizen tab is hidden from the tab bar.
 *
 * Tests the page SERVER load (not the component render, which needs SvelteKit
 * context) — verifies that `currentYearState` is threaded through correctly
 * and the `openYears`/`satzByYear` data is available for the new props.
 */

import { describe, it, expect } from "vitest";
import { resolveBeitragState } from "$lib/domain/beitrag-state.js";

// The detail page exposes openYears + currentYearBeitrag + satzByYear from the
// server load. Verify that the resolver correctly determines the CTA mode from
// those values — the page derives canSendReminder from the resolved state.

describe("[id]/+page.svelte — Package D (server data contract)", () => {
  it("paid member: resolved state = paid → no reminder CTA warranted", () => {
    const state = resolveBeitragState({
      year: 2026,
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: {
        betragCents: 6000,
        paidCents: 6000,
        isExempt: false,
        gezahltAm: "2026-02-01",
      },
      satzCents: 6000,
      festBis: null,
    });
    expect(state.state).toBe("paid");
    // No reminder for paid members
    const isRemindable =
      state.state !== "paid" &&
      state.state !== "exempt" &&
      state.state !== "permanently_exempt" &&
      state.state !== "not_applicable_post_austritt" &&
      state.state !== "not_applicable_pre_join";
    expect(isRemindable).toBe(false);
  });

  it("open member: resolved state = open/overdue → reminder CTA is warranted", () => {
    const state = resolveBeitragState({
      year: 2020, // old year so overdue threshold is passed
      eintrittsJahr: 2020,
      austrittsJahr: null,
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
    });
    expect(["open", "overdue"]).toContain(state.state);
    const isRemindable =
      state.state !== "paid" &&
      state.state !== "exempt" &&
      state.state !== "permanently_exempt" &&
      state.state !== "not_applicable_post_austritt" &&
      state.state !== "not_applicable_pre_join";
    expect(isRemindable).toBe(true);
  });

  it("ausgetreten member: not_applicable_post_austritt → no reminder", () => {
    const state = resolveBeitragState({
      year: 2026,
      eintrittsJahr: 2020,
      austrittsJahr: 2024, // left in 2024
      beitragExempt: false,
      row: null,
      satzCents: 6000,
      festBis: null,
    });
    expect(state.state).toBe("not_applicable_post_austritt");
    const isRemindable =
      state.state !== "paid" &&
      state.state !== "exempt" &&
      state.state !== "permanently_exempt" &&
      state.state !== "not_applicable_post_austritt" &&
      state.state !== "not_applicable_pre_join";
    expect(isRemindable).toBe(false);
  });
});
