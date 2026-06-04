/**
 * Sphere derivation (pure functions).
 *
 * The four steuerliche Sphären of a gemeinnütziger Verein (per §52 AO):
 *   - ideeller — Ideeller Bereich (Spenden, Mitgliedsbeiträge, Zuschüsse)
 *   - vermoegen — Vermögensverwaltung (Zinsen, Mieteinnahmen)
 *   - zweckbetrieb — Zweckbetrieb (satzungsmäßiger Eventbetrieb)
 *   - wirtschaftlich — Wirtschaftlicher Geschäftsbetrieb (Bar, Merch, Sponsoring)
 *
 * Derivation precedence (per ADR-0002 + ADR-0008):
 *   1. expense.sphere_snapshot (write-time captured at create — immutable)
 *   2. expense.sphere_override (pre-Festschreibung admin correction)
 *   3. project.sphere_default (ADR-0008)
 *   4. kategorie.sphere (default)
 *
 * Post-Festschreibung corrections route through sphere_overrides table
 * (ADR-0011) — DEFERRED to Phase 2.
 */

export const SPHERES = [
  "ideeller",
  "vermoegen",
  "zweckbetrieb",
  "wirtschaftlich",
] as const;

export type Sphere = (typeof SPHERES)[number];

/**
 * Human-readable German labels mapped from canonical enum values.
 * Used in mail templates, EÜR exports, dashboards.
 */
export const SPHERE_LABELS: Record<Sphere, string> = {
  ideeller: "Ideeller Bereich",
  vermoegen: "Vermögensverwaltung",
  zweckbetrieb: "Zweckbetrieb",
  wirtschaftlich: "Wirtschaftlicher Geschäftsbetrieb",
};

/** Reverse map for importer/parity with legacy sheet values. */
export const LEGACY_SPHERE_TO_CANONICAL: Record<string, Sphere> = {
  "Ideeller Bereich": "ideeller",
  Vermögensverwaltung: "vermoegen",
  Zweckbetrieb: "zweckbetrieb",
  "Wirtschaftlicher Geschäftsbetrieb": "wirtschaftlich",
};

/** Strict kategorie → sphere (spec §4.5). NEVER consults a project sphere_default. */
export function kategorieSphere(
  kategorien: readonly { name: string; sphere: Sphere }[],
  kategorieName: string,
): Sphere {
  const match = kategorien.find((k) => k.name === kategorieName);
  return match ? match.sphere : "ideeller";
}

/**
 * Resolve effective sphere for an expense pre-Festschreibung.
 * NOTE: This is a pure function. The DB-backed `effective_sphere(expense_id)`
 * SQL function (ADR-0011) is implemented in Phase 2.
 */
export function deriveSphere(input: {
  sphereOverride?: Sphere | null;
  sphereSnapshot: Sphere;
  projectSphereDefault?: Sphere | null;
}): Sphere {
  if (input.sphereOverride) return input.sphereOverride;
  // sphere_snapshot was captured at write-time honoring project.sphere_default
  // via the domain layer, so we trust it. The project default is exposed here
  // only for forward-looking callers that need to know "what would this become
  // if linked to project X" (pre-creation UX hint).
  return input.sphereSnapshot;
}
