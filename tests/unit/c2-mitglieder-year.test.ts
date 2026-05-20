/**
 * C2 cycle 3 — /app/mitglieder?year=NNNN must anchor the Beitragsmatrix
 * window on the SELECTED year (selected ± 1), not on the current calendar
 * year (currentYear ± 1).
 *
 * Resolves: C2-2 (julia P1 — Mitglieder Beitragsmatrix ignored ?year=).
 */

import { describe, expect, it } from "vitest";
import { load as mitgliederLoad } from "../../src/routes/app/mitglieder/+page.server.js";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

function makeEvent(searchString: string) {
  return {
    url: new URL(`http://localhost/app/mitglieder${searchString}`),
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

    it("defaults to current-year window when ?year is absent", async () => {
      const data = await mitgliederLoad(makeEvent(""));
      const current = new Date().getFullYear();
      expect((data as { years: number[] }).years).toEqual([
        current - 1,
        current,
        current + 1,
      ]);
    });

    it("falls back to current year on garbage ?year input", async () => {
      const data = await mitgliederLoad(makeEvent("?year=foo"));
      const current = new Date().getFullYear();
      expect((data as { years: number[] }).years).toEqual([
        current - 1,
        current,
        current + 1,
      ]);
    });
  },
);
