/**
 * Dataviz number + date formatting (de-DE) — the single formatter surface for
 * every chart in `$lib/components/charts`.
 *
 * Doctrine (`_kit/dataviz.md` §3.8): `12.345,67 €` — comma decimal, point
 * thousands, real minus `−` (U+2212), € after the number. All money enters as
 * integer cents (ADR-0003); never a float. `tabular-nums` is applied by the
 * consuming markup, not here.
 */

/** Month short labels (Jan–Dez) — the x-axis vocabulary of every 12-point chart. */
export const MONTHS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

/** Month full labels — used in readout/tooltip headers and sr-only tables. */
export const MONTHS_FULL = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

const eur0 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const eur2 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const eur0Signed = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  signDisplay: "always",
});
const eur2Signed = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});
const pct1Signed = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "always",
});
const pct1 = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Replace ASCII hyphen-minus with the real minus sign U+2212 (dataviz §3.8). */
export function realMinus(s: string): string {
  return s.replace(/-/g, "−");
}

/** Whole-euro money from integer cents: `1482045` → `14.820 €`. */
export function eurWhole(cents: number): string {
  return realMinus(eur0.format(Math.round(cents / 100)));
}

/** Two-decimal money from integer cents: `1482045` → `14.820,45 €`. */
export function eurCents(cents: number): string {
  return realMinus(eur2.format(cents / 100));
}

/** Signed whole-euro money: `+5.620 €` / `−1.800 €`. */
export function eurWholeSigned(cents: number): string {
  return realMinus(eur0Signed.format(Math.round(cents / 100)));
}

/** Signed two-decimal money: `+2.300,00 €` / `−3.520,00 €`. */
export function eurCentsSigned(cents: number): string {
  return realMinus(eur2Signed.format(cents / 100));
}

/** Integer percent with the German hairline space: `85` → `85 %`. */
export function pctWhole(n: number): string {
  return `${Math.round(n)} %`;
}

/** One-decimal percent: `31.5` → `31,5 %`. */
export function pctOne(n: number): string {
  return realMinus(pct1.format(n)) + " %";
}

/** Signed one-decimal percent: `+20,6 %` / `−103,5 %`. */
export function pctOneSigned(n: number): string {
  return realMinus(pct1Signed.format(n)) + " %";
}

/**
 * Split a two-decimal money string into the euros part and the demoted
 * `,45 €` tail, for hero figures that render the cents at a smaller weight
 * (dataviz §5 "long money values don't break the tile").
 */
export function heroParts(cents: number): { main: string; rest: string } {
  const s = eurCents(cents);
  const ci = s.indexOf(",");
  if (ci === -1) return { main: s, rest: "" };
  return { main: s.slice(0, ci), rest: s.slice(ci) };
}

/** de-DE integer for bare axis ticks (no currency symbol): `1000` → `1.000`. */
const int0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
export function intWhole(n: number): string {
  return realMinus(int0.format(Math.round(n)));
}
