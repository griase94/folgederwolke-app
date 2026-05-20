/**
 * @vitest-environment node
 * @phase-5
 *
 * Unit tests for the /app/transactions/neu picker logic (cluster C4).
 *
 * Covers findings VB-004 (vereinsbuchhalter) + JB-014 (julia-buchhaltung):
 * the form previously hardcoded sphereSnapshot="ideeller" and
 * kategorieNameSnapshot="(Unkategorisiert)", corrupting the EÜR sphere
 * aggregation. The fix is a real Kategorie picker that drives the sphere
 * (overridable by project.sphereDefault per ADR-0008).
 *
 * Pure helpers tested here:
 *   - resolveSphereForKategorie: derives sphere from the picked kategorie,
 *     with project.sphereDefault as override (ADR-0008).
 *   - pickDefaultKategorieName: smart pre-selection — last-used-by-this-user
 *     per project + kind, falling back to first by sortOrder.
 *
 * DB-bound queries (loadKategorieOptions, loadRecentKategorieUsage) are
 * thin SELECTs covered by PR-time integration testing — see PR body
 * "Deferred" section.
 */

import { describe, it, expect } from "vitest";
import {
  resolveSphereForKategorie,
  pickDefaultKategorieName,
  type KategorieOption,
  type RecentKategorieUse,
} from "./transaction-pickers.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function kat(overrides: Partial<KategorieOption> = {}): KategorieOption {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    kind: "expense",
    name: "Bürobedarf",
    sphere: "ideeller",
    sortOrder: 0,
    deactivated: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveSphereForKategorie
// ---------------------------------------------------------------------------

describe("resolveSphereForKategorie", () => {
  it("returns the kategorie's sphere when no project override exists", () => {
    const kategorien = [
      kat({ name: "Bürobedarf", sphere: "ideeller" }),
      kat({ name: "Konzertticket", sphere: "zweckbetrieb" }),
    ];
    expect(
      resolveSphereForKategorie({
        kategorien,
        kategorieName: "Konzertticket",
        projectSphereOverride: null,
      }),
    ).toBe("zweckbetrieb");
  });

  it("returns project.sphereDefault when project override is set (ADR-0008)", () => {
    const kategorien = [kat({ name: "Honorar", sphere: "zweckbetrieb" })];
    expect(
      resolveSphereForKategorie({
        kategorien,
        kategorieName: "Honorar",
        projectSphereOverride: "wirtschaftlich",
      }),
    ).toBe("wirtschaftlich");
  });

  it("falls back to 'ideeller' when the kategorieName is unknown (defensive)", () => {
    // The form is supposed to require a valid pick, but if the validator ever
    // lets an unknown name through we should NOT silently re-introduce the bug —
    // we fall back to a defined default and let the server-side schema reject.
    const kategorien = [kat({ name: "Bürobedarf", sphere: "wirtschaftlich" })];
    expect(
      resolveSphereForKategorie({
        kategorien,
        kategorieName: "Hat-niemand-erfunden",
        projectSphereOverride: null,
      }),
    ).toBe("ideeller");
  });

  it("REGRESSION VB-004: does not silently coerce a zweckbetrieb Kategorie to 'ideeller'", () => {
    // This is the core tax-correctness bug. Before the fix, the form forced
    // every booking into the ideeller sphere regardless of the Kategorie.
    const kategorien = [
      kat({ name: "Eintritt Konzert", sphere: "zweckbetrieb" }),
    ];
    const sphere = resolveSphereForKategorie({
      kategorien,
      kategorieName: "Eintritt Konzert",
      projectSphereOverride: null,
    });
    expect(sphere).not.toBe("ideeller");
    expect(sphere).toBe("zweckbetrieb");
  });

  it("REGRESSION VB-004: does not silently coerce a wirtschaftlich Kategorie to 'ideeller'", () => {
    const kategorien = [
      kat({ name: "T-Shirt-Verkauf", sphere: "wirtschaftlich" }),
    ];
    const sphere = resolveSphereForKategorie({
      kategorien,
      kategorieName: "T-Shirt-Verkauf",
      projectSphereOverride: null,
    });
    expect(sphere).toBe("wirtschaftlich");
  });
});

// ---------------------------------------------------------------------------
// pickDefaultKategorieName
// ---------------------------------------------------------------------------

describe("pickDefaultKategorieName", () => {
  it("returns the most-recent kategorie used by this user for this project + kind", () => {
    const kategorien = [
      kat({ name: "Bürobedarf", kind: "expense", sortOrder: 1 }),
      kat({ name: "Raummiete", kind: "expense", sortOrder: 2 }),
      kat({ name: "Honorar", kind: "expense", sortOrder: 3 }),
    ];
    const recent: RecentKategorieUse[] = [
      {
        kategorieName: "Bürobedarf",
        kind: "expense",
        projectId: "P-1",
        usedAt: new Date("2026-04-01"),
      },
      {
        kategorieName: "Raummiete",
        kind: "expense",
        projectId: "P-1",
        usedAt: new Date("2026-05-01"),
      },
      {
        kategorieName: "Honorar",
        kind: "expense",
        projectId: "P-2",
        usedAt: new Date("2026-05-15"),
      },
    ];
    expect(
      pickDefaultKategorieName({
        kategorien,
        recent,
        projectId: "P-1",
        kind: "expense",
      }),
    ).toBe("Raummiete");
  });

  it("scopes by kind — income picker does not pull from expense history", () => {
    const kategorien = [
      kat({ name: "Bürobedarf", kind: "expense", sortOrder: 1 }),
      kat({ name: "Spendeneingang", kind: "income", sortOrder: 1 }),
      kat({ name: "Tickets", kind: "income", sortOrder: 2 }),
    ];
    const recent: RecentKategorieUse[] = [
      {
        kategorieName: "Bürobedarf",
        kind: "expense",
        projectId: null,
        usedAt: new Date("2026-05-01"),
      },
      {
        kategorieName: "Tickets",
        kind: "income",
        projectId: null,
        usedAt: new Date("2026-04-01"),
      },
    ];
    expect(
      pickDefaultKategorieName({
        kategorien,
        recent,
        projectId: null,
        kind: "income",
      }),
    ).toBe("Tickets");
  });

  it("scopes by projectId — null project does not match a non-null one", () => {
    const kategorien = [
      kat({ name: "Bürobedarf", kind: "expense", sortOrder: 1 }),
      kat({ name: "Raummiete", kind: "expense", sortOrder: 2 }),
    ];
    const recent: RecentKategorieUse[] = [
      {
        kategorieName: "Raummiete",
        kind: "expense",
        projectId: "P-1",
        usedAt: new Date("2026-05-01"),
      },
    ];
    // Picker is for a no-project booking → must NOT inherit P-1's last-used.
    const pick = pickDefaultKategorieName({
      kategorien,
      recent,
      projectId: null,
      kind: "expense",
    });
    expect(pick).toBe("Bürobedarf"); // falls back to sortOrder 1
  });

  it("falls back to the first non-deactivated kategorie by sortOrder when no history exists", () => {
    const kategorien = [
      kat({
        name: "Deactiviert",
        kind: "expense",
        sortOrder: 0,
        deactivated: true,
      }),
      kat({ name: "Bürobedarf", kind: "expense", sortOrder: 1 }),
      kat({ name: "Raummiete", kind: "expense", sortOrder: 2 }),
    ];
    expect(
      pickDefaultKategorieName({
        kategorien,
        recent: [],
        projectId: null,
        kind: "expense",
      }),
    ).toBe("Bürobedarf");
  });

  it("REGRESSION JB-014: never returns the legacy '(Unkategorisiert)' placeholder", () => {
    // The placeholder was a sentinel in the old hidden-input form. It must
    // never surface from the picker — categorization is now required.
    const kategorien = [
      kat({ name: "Bürobedarf", kind: "expense", sortOrder: 1 }),
    ];
    const pick = pickDefaultKategorieName({
      kategorien,
      recent: [],
      projectId: null,
      kind: "expense",
    });
    expect(pick).not.toBe("(Unkategorisiert)");
    expect(pick).toBe("Bürobedarf");
  });

  it("returns null when the kategorien list is empty (caller must surface an error)", () => {
    expect(
      pickDefaultKategorieName({
        kategorien: [],
        recent: [],
        projectId: null,
        kind: "expense",
      }),
    ).toBeNull();
  });

  it("filters deactivated kategorien out of the fallback", () => {
    const kategorien = [
      kat({
        name: "Alt-Kategorie",
        kind: "expense",
        sortOrder: 1,
        deactivated: true,
      }),
      kat({ name: "Bürobedarf", kind: "expense", sortOrder: 2 }),
    ];
    expect(
      pickDefaultKategorieName({
        kategorien,
        recent: [],
        projectId: null,
        kind: "expense",
      }),
    ).toBe("Bürobedarf");
  });
});

// ---------------------------------------------------------------------------
// Sphere enum invariant — must accept all four values from kategorien.sphere
// ---------------------------------------------------------------------------

describe("resolveSphereForKategorie — all sphere values", () => {
  it.each([
    ["ideeller"],
    ["vermoegen"],
    ["zweckbetrieb"],
    ["wirtschaftlich"],
  ] as const)("passes through sphere=%s unchanged", (sphere) => {
    const kategorien = [kat({ name: "K", sphere })];
    expect(
      resolveSphereForKategorie({
        kategorien,
        kategorieName: "K",
        projectSphereOverride: null,
      }),
    ).toBe(sphere);
  });
});
