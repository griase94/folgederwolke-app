/**
 * Phase 10 — Rechnung v2 public API.
 *
 * Re-exports the renderer + input type for consumers (domain layer, tests).
 */
export {
  renderRechnungV2,
  formatEur,
  formatDE,
  countryLabelForAlpha2,
} from "./template.js";
export type { RechnungV2Input } from "./template.js";
