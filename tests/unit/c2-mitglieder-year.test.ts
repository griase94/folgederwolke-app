/**
 * C2 cycle 3 — /app/mitglieder?year=NNNN must anchor the Beitragsmatrix
 * window on the SELECTED year (selected ± 1), not on the current calendar
 * year (currentYear ± 1).
 *
 * Resolves: C2-2 (julia P1 — Mitglieder Beitragsmatrix ignored ?year=).
 */

import { describe, expect, it } from "vitest";
import { load as mitgliederLoad } from "../../src/routes/app/mitglieder/+page.server.js";
import { currentBuchungsjahr } from "$lib/domain/year.js";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

function makeEvent(searchString: string) {
  return {
    url: new URL(`http://localhost/app/mitglieder${searchString}`),
    // PR3b: the load now registers a scoped `depends('app:beitrags-matrix')`
    // dependency (for the optimistic-matrix reconcile). SvelteKit always
    // supplies `depends` on the LoadEvent; provide a no-op so this fixture
    // matches the real event shape.
    depends: () => {},
    locals: {
      session: {
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "admin@example.com",
          name: "Admin",
          isAdmin: true,
        },
      },
    },
  } as unknown as Parameters<typeof mitgliederLoad>[0];
}

describe.skipIf(!url)(
  "C2-2 — Mitglieder Beitragsmatrix anchors on ?year=",
  () => {
    it("anchors the 3-year window on ?year=2024 (showing 2023/2024/2025)", async () => {
      const data = await mitgliederLoad(makeEvent("?year=2024"));
      expect((data as { years: number[] }).years).toEqual([2023, 2024, 2025]);
    });

    it("defaults to the clamped current-year window when ?year is absent (F8: no future column)", async () => {
      const data = await mitgliederLoad(makeEvent(""));
      // F8: beitragYearsRange clamps its upper bound to the current Buchungsjahr,
      // so the default window is [current-2, current-1, current] (no anchor+1
      // future cell). Oracle uses currentBuchungsjahr() to share the Berlin TZ
      // basis with the implementation (avoids a UTC↔Berlin New-Year flake).
      const current = currentBuchungsjahr();
      expect((data as { years: number[] }).years).toEqual([
        current - 2,
        current - 1,
        current,
      ]);
    });

    it("falls back to the clamped current-year window on garbage ?year input (F8)", async () => {
      const data = await mitgliederLoad(makeEvent("?year=foo"));
      const current = currentBuchungsjahr();
      expect((data as { years: number[] }).years).toEqual([
        current - 2,
        current - 1,
        current,
      ]);
    });
  },
);
