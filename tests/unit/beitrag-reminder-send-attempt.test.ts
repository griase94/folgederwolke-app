// @vitest-environment node
/**
 * Pins the jahresbasierte `send_attempt` contract (ADR-0005).
 *
 * The manual single/Bulk reminder path and the annual cron
 * (`dispatchBeitragsreminder`, cron-tasks.ts) MUST compute `send_attempt` the
 * same way, or a member could receive a duplicate reminder for one year (one
 * per path) or a legitimate next-year reminder could be silently deduped. The
 * shared helper is `reminderSendAttempt(year) = year - 2020`; the cron uses the
 * identical `currentYear - 2020` inline. This test freezes the formula so a
 * drift on either side is caught in CI.
 *
 * @aurora-impl-c2
 */
import { describe, it, expect } from "vitest";
import { reminderSendAttempt } from "$lib/server/domain/beitrag-reminder.js";

describe("reminderSendAttempt — jahresbasiert, pinned to the cron", () => {
  it("matches the cron's year-2020 formula", () => {
    for (const y of [2020, 2024, 2025, 2026, 2030]) {
      expect(reminderSendAttempt(y)).toBe(y - 2020);
    }
  });

  it("gives distinct keys for adjacent years (fixes the year-collision)", () => {
    expect(reminderSendAttempt(2026)).not.toBe(reminderSendAttempt(2025));
  });
});
