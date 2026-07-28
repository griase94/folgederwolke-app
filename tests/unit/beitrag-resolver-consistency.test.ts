/**
 * @vitest-environment node
 *
 * C-S0 Pflicht-Gate — resolver consistency across surfaces (flow-mitglieder
 * Risk 1). The Matrix header, the Kassenbericht totals and the Reminder-
 * candidate list all derive from the ONE canonical resolver
 * (`resolveBeitragState`). This test proves they cannot drift: run all three
 * against the SAME seeded DB and assert they agree — member-for-member and in
 * their aggregates.
 *
 * Deliberately SEED-AGNOSTIC (the FIXTURES §14 roster canon never landed in the
 * seed — MASTERPLAN 27.07): it asserts the three surfaces reconcile with EACH
 * OTHER, not against hard-coded canon numbers. So it stays green regardless of
 * which members the seed contains, while still catching any wiring that feeds
 * one surface a different festBis / graceDays / faelligkeit / Satz basis.
 */

import { describe, expect, it } from "vitest";
import { loadMatrix } from "$lib/server/domain/matrix-loader.js";
import { loadReminderCandidates } from "$lib/server/domain/reminder-candidates.js";
import {
  load as berichtLoad,
  type BerichtRow,
  type BerichtTotals,
} from "../../src/routes/app/mitglieder/bericht/[year]/+page.server.js";
import { currentBuchungsjahr } from "$lib/domain/year.js";

/** The load returns `void` on error() paths; with a valid admin event it always
 * returns the data — narrow it for the assertions. */
type BerichtData = { rows: BerichtRow[]; totals: BerichtTotals };

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

const OWING = new Set(["open", "partial", "overdue"]);

function berichtEvent(year: number) {
  return {
    params: { year: String(year) },
    locals: { session: { user: { role: "admin" } } },
  } as unknown as Parameters<typeof berichtLoad>[0];
}

describe.skipIf(!url)(
  "beitrag resolver consistency (Matrix ≡ Bericht ≡ Reminder)",
  () => {
    const year = currentBuchungsjahr();

    it("assigns every applicable member the SAME state on all three surfaces", async () => {
      const matrix = await loadMatrix({ years: [year] });
      const bericht = (await berichtLoad(berichtEvent(year))) as BerichtData;
      const reminder = await loadReminderCandidates(year);

      // memberId → Matrix cell state for the year.
      const matrixState = new Map(
        matrix.cells
          .filter((c) => c.year === year)
          .map((c) => [c.memberId, c.state]),
      );
      // active (non-ausgetreten) members per the Matrix member list.
      const activeIds = new Set(
        matrix.members.filter((m) => m.austrittsJahr === null).map((m) => m.id),
      );

      // 1. Every Bericht row's status equals the Matrix state for that member.
      //    (Bericht rows are the applicable subset; not_applicable cells are
      //    dropped on both surfaces, so the states line up 1:1.)
      for (const row of bericht.rows) {
        expect(
          matrixState.get(row.memberId),
          `member ${row.memberId} status drift: Bericht=${row.status} Matrix=${matrixState.get(row.memberId)}`,
        ).toBe(row.status);
      }

      // 2. Paid sum reconciles between the Matrix header and the Bericht totals.
      const header = matrix.headers.find((h) => h.year === year);
      expect(header).toBeDefined();
      expect(bericht.totals.paidSumCents).toBe(header!.paidSumCents);

      // 3. Reminder candidates == the active members the Bericht marks as owing.
      const berichtOwingActive = new Set(
        bericht.rows
          .filter((r) => OWING.has(r.status) && activeIds.has(r.memberId))
          .map((r) => r.memberId),
      );
      const candidateIds = new Set(reminder.candidates.map((c) => c.memberId));
      expect(candidateIds).toEqual(berichtOwingActive);

      // 4. Each candidate's openCents equals the Bericht outstanding (Soll − paid).
      const berichtOutstanding = new Map(
        bericht.rows.map((r) => [
          r.memberId,
          Math.max(r.betragCents - r.paidCents, 0),
        ]),
      );
      for (const c of reminder.candidates) {
        expect(c.openCents).toBe(berichtOutstanding.get(c.memberId));
      }
    });
  },
);
