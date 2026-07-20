/**
 * Aurora dataviz chart family — the nine locked catalog forms as Svelte 5
 * components (dataviz doctrine: `.superpowers/mockups/_kit/dataviz.md`).
 * Token-only colours, desktop hover layers, mobile hover-free with sr-only
 * table twins, robust at real Vereins-scale.
 */
export { SaldoVerlauf, type SaldoVerlaufProps } from "./saldo-verlauf/index.js";
export {
  Cashflow,
  type CashflowProps,
  type CashflowMonth,
} from "./cashflow/index.js";
export {
  SphaerenBars,
  type SphaerenBarsProps,
  type SphaerenRow,
} from "./sphaeren/index.js";
export {
  KategorienRanking,
  type KategorienRankingProps,
  type KategorieItem,
  type RankingHue,
} from "./kategorien/index.js";
export {
  FreigrenzeGauge,
  type FreigrenzeGaugeProps,
} from "./freigrenze/index.js";
export {
  BeitraegeStatus,
  type BeitraegeStatusProps,
  type BeitragStateInput,
} from "./beitraege-status/index.js";
export {
  BeitragVerlauf,
  type BeitragVerlaufProps,
} from "./beitrag-verlauf/index.js";
export {
  EuerStruktur,
  type EuerStrukturProps,
  type EuerCategory,
} from "./euer-struktur/index.js";
export {
  AgingRail,
  type AgingRailProps,
  ProgressRing,
  type ProgressRingProps,
  ZoneMeter,
  type ZoneMeterProps,
  CompareBars,
  type CompareBarsProps,
  DeltaChip,
  type DeltaChipProps,
  MiniSparkline,
  type MiniSparklineProps,
  StatTile,
  type StatTileProps,
  type StatTileChip,
  type StatTileChipVariant,
} from "./stat-tiles/index.js";
