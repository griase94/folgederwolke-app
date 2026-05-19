/**
 * EÜR domain helpers — pure computation, no DB access.
 *
 * Computes Einnahmen-Überschuss-Rechnung per sphere (ADR-0002) and maps
 * rows to ELSTER Anlage-EÜR Zeilen and Anlage Gem Zeilen.
 *
 * All monetary values are in integer cents (ADR-0003).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type Sphere =
  | "ideeller"
  | "vermoegen"
  | "zweckbetrieb"
  | "wirtschaftlich";

export interface EurRow {
  businessId: string;
  gebuchtAm: Date;
  betragCents: bigint;
  sphereSnapshot: Sphere;
  kategorieId: string | null;
  kategorieNameSnapshot: string;
  eurZeile: number | null;
  anlageGemZeile: number | null;
  bezeichnung: string;
  belegDriveFileId: string | null;
  belegOriginalName: string | null;
}

export interface SphereTotals {
  einnahmenCents: bigint;
  ausgabenCents: bigint;
  ueberschussCents: bigint;
}

export interface EurSphereResult {
  sphere: Sphere;
  einnahmen: EurRow[];
  ausgaben: EurRow[];
  totals: SphereTotals;
}

export interface EurYearResult {
  year: number;
  bySphere: Record<Sphere, EurSphereResult>;
  totalEinnahmenCents: bigint;
  totalAusgabenCents: bigint;
  totalUeberschussCents: bigint;
}

export interface AnlageEurZeile {
  zeile: number;
  bezeichnung: string;
  betragCents: bigint;
}

export interface AnlageGemZeile {
  zeile: number;
  bezeichnung: string;
  betragCents: bigint;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const SPHERES: Sphere[] = [
  "ideeller",
  "vermoegen",
  "zweckbetrieb",
  "wirtschaftlich",
];

export const SPHERE_LABELS: Record<Sphere, string> = {
  ideeller: "Ideeller Bereich",
  vermoegen: "Vermögensverwaltung",
  zweckbetrieb: "Zweckbetrieb",
  wirtschaftlich: "Wirtschaftlicher Geschäftsbetrieb",
};

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Aggregate income + expense EurRows by sphere for a given year.
 * Returns the full EÜR structure with per-sphere and total figures.
 */
export function computeEurYear(
  year: number,
  einnahmenRows: EurRow[],
  ausgabenRows: EurRow[],
): EurYearResult {
  const bySphere = {} as Record<Sphere, EurSphereResult>;

  for (const sphere of SPHERES) {
    const einnahmen = einnahmenRows.filter((r) => r.sphereSnapshot === sphere);
    const ausgaben = ausgabenRows.filter((r) => r.sphereSnapshot === sphere);

    const einnahmenCents = einnahmen.reduce(
      (acc, r) => acc + r.betragCents,
      0n,
    );
    const ausgabenCents = ausgaben.reduce((acc, r) => acc + r.betragCents, 0n);

    bySphere[sphere] = {
      sphere,
      einnahmen,
      ausgaben,
      totals: {
        einnahmenCents,
        ausgabenCents,
        ueberschussCents: einnahmenCents - ausgabenCents,
      },
    };
  }

  const totalEinnahmenCents = einnahmenRows.reduce(
    (acc, r) => acc + r.betragCents,
    0n,
  );
  const totalAusgabenCents = ausgabenRows.reduce(
    (acc, r) => acc + r.betragCents,
    0n,
  );

  return {
    year,
    bySphere,
    totalEinnahmenCents,
    totalAusgabenCents,
    totalUeberschussCents: totalEinnahmenCents - totalAusgabenCents,
  };
}

/**
 * Aggregate rows by eur_zeile (ELSTER Anlage-EÜR line numbers).
 * Rows with null eur_zeile are collected under a synthetic zeile=0 bucket.
 */
export function aggregateByEurZeile(rows: EurRow[]): AnlageEurZeile[] {
  const byZeile = new Map<
    number,
    { bezeichnung: string; betragCents: bigint }
  >();
  for (const row of rows) {
    const zeile = row.eurZeile ?? 0;
    const existing = byZeile.get(zeile);
    if (existing) {
      existing.betragCents += row.betragCents;
    } else {
      byZeile.set(zeile, {
        bezeichnung: row.eurZeile
          ? `Zeile ${row.eurZeile}`
          : `Ohne ELSTER-Zuordnung (${row.kategorieNameSnapshot})`,
        betragCents: row.betragCents,
      });
    }
  }
  return [...byZeile.entries()]
    .sort(([a], [b]) => a - b)
    .map(([zeile, { bezeichnung, betragCents }]) => ({
      zeile,
      bezeichnung,
      betragCents,
    }));
}

/**
 * Aggregate rows by anlage_gem_zeile for Steuerbegünstigte-Zwecke reporting.
 */
export function aggregateByAnlageGemZeile(rows: EurRow[]): AnlageGemZeile[] {
  const byZeile = new Map<
    number,
    { bezeichnung: string; betragCents: bigint }
  >();
  for (const row of rows) {
    if (!row.anlageGemZeile) continue;
    const existing = byZeile.get(row.anlageGemZeile);
    if (existing) {
      existing.betragCents += row.betragCents;
    } else {
      byZeile.set(row.anlageGemZeile, {
        bezeichnung: `Zeile ${row.anlageGemZeile} (${row.kategorieNameSnapshot})`,
        betragCents: row.betragCents,
      });
    }
  }
  return [...byZeile.entries()]
    .sort(([a], [b]) => a - b)
    .map(([zeile, { bezeichnung, betragCents }]) => ({
      zeile,
      bezeichnung,
      betragCents,
    }));
}

// ── Formatting ────────────────────────────────────────────────────────────────

/** Format cents as German EUR string: "1.234,56 €". */
export function formatEurCents(cents: bigint | number): string {
  const n = typeof cents === "bigint" ? Number(cents) : cents;
  return (n / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a Date as dd.mm.yyyy (German locale). */
export function formatGermanDate(d: Date): string {
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
