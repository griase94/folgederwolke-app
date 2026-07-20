/**
 * Pure SVG geometry helpers for the chart family — path builders, splines,
 * axis rounding, gauge/ring math. No DOM, no tokens: these return path `d`
 * strings and numbers only, so they are trivially unit-testable and shared by
 * every chart component.
 *
 * Marks obey the non-negotiables (`_kit/dataviz.md` §3): 4px rounded data-end,
 * square baseline; thin marks; one axis.
 */

export type Point = [number, number];

/** 2-decimal coordinate rounding — keeps emitted path strings compact. */
export const r2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * Horizontal bar growing RIGHT from `x0`: square left edge, 4px-rounded right
 * corners. Square baseline anchor per §3.3.
 */
export function barRight(
  x0: number,
  y: number,
  w: number,
  h: number,
  radius = 4,
): string {
  w = Math.max(w, 0);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const x1 = x0 + w;
  return (
    `M${r2(x0)},${r2(y)} L${r2(x1 - r)},${r2(y)} Q${r2(x1)},${r2(y)} ${r2(x1)},${r2(y + r)} ` +
    `L${r2(x1)},${r2(y + h - r)} Q${r2(x1)},${r2(y + h)} ${r2(x1 - r)},${r2(y + h)} L${r2(x0)},${r2(y + h)} Z`
  );
}

/** Horizontal bar growing LEFT from `x0`: square right edge, rounded left. */
export function barLeft(
  x0: number,
  y: number,
  w: number,
  h: number,
  radius = 4,
): string {
  w = Math.max(w, 0);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const x1 = x0 - w;
  return (
    `M${r2(x0)},${r2(y)} L${r2(x1 + r)},${r2(y)} Q${r2(x1)},${r2(y)} ${r2(x1)},${r2(y + r)} ` +
    `L${r2(x1)},${r2(y + h - r)} Q${r2(x1)},${r2(y + h)} ${r2(x1 + r)},${r2(y + h)} L${r2(x0)},${r2(y + h)} Z`
  );
}

/** Column growing UP to `topY` from baseline `baseY`: rounded top, square base. */
export function barUp(
  x: number,
  w: number,
  topY: number,
  baseY: number,
  radius = 4,
): string {
  const r = Math.max(0, Math.min(radius, w / 2, baseY - topY));
  return (
    `M${r2(x)},${r2(baseY)} L${r2(x)},${r2(topY + r)} Q${r2(x)},${r2(topY)} ${r2(x + r)},${r2(topY)} ` +
    `L${r2(x + w - r)},${r2(topY)} Q${r2(x + w)},${r2(topY)} ${r2(x + w)},${r2(topY + r)} L${r2(x + w)},${r2(baseY)} Z`
  );
}

/** Column growing DOWN to `botY` from baseline `topY`: rounded bottom, square top. */
export function barDown(
  x: number,
  w: number,
  topY: number,
  botY: number,
  radius = 4,
): string {
  const r = Math.max(0, Math.min(radius, w / 2, botY - topY));
  return (
    `M${r2(x)},${r2(topY)} L${r2(x + w)},${r2(topY)} L${r2(x + w)},${r2(botY - r)} ` +
    `Q${r2(x + w)},${r2(botY)} ${r2(x + w - r)},${r2(botY)} L${r2(x + r)},${r2(botY)} Q${r2(x)},${r2(botY)} ${r2(x)},${r2(botY - r)} Z`
  );
}

/** Straight polyline through the points: `M … L … L …`. */
export function linePath(pts: readonly Point[]): string {
  return "M" + pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join(" L");
}

/**
 * Monotone cubic (Fritsch–Carlson) — a smooth line with no overshoot near
 * zero, so a net-line never dips below a bar it should touch (cashflow §6).
 */
export function monotonePath(pts: readonly Point[]): string {
  const N = pts.length;
  if (N < 2) return linePath(pts);
  // Loops are bounded to valid indices; assertions keep the math readable.
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const dx: number[] = [];
  const sl: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    dx[i] = xs[i + 1]! - xs[i]!;
    sl[i] = (ys[i + 1]! - ys[i]!) / dx[i]!;
  }
  const m = new Array<number>(N);
  m[0] = sl[0]!;
  m[N - 1] = sl[N - 2]!;
  for (let i = 1; i < N - 1; i++) {
    m[i] = sl[i - 1]! * sl[i]! <= 0 ? 0 : (sl[i - 1]! + sl[i]!) / 2;
  }
  for (let i = 0; i < N - 1; i++) {
    if (sl[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / sl[i]!;
    const b = m[i + 1]! / sl[i]!;
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      m[i] = t * a * sl[i]!;
      m[i + 1] = t * b * sl[i]!;
    }
  }
  let d = `M${r2(xs[0]!)},${r2(ys[0]!)}`;
  for (let i = 0; i < N - 1; i++) {
    const c1x = xs[i]! + dx[i]! / 3;
    const c1y = ys[i]! + (m[i]! * dx[i]!) / 3;
    const c2x = xs[i + 1]! - dx[i]! / 3;
    const c2y = ys[i + 1]! - (m[i + 1]! * dx[i]!) / 3;
    d += ` C${r2(c1x)},${r2(c1y)} ${r2(c2x)},${r2(c2y)} ${r2(xs[i + 1]!)},${r2(ys[i + 1]!)}`;
  }
  return d;
}

/** Close a line into an area down to `baseY` (for the wash fill under a line). */
export function areaFromLine(
  linePath: string,
  pts: readonly Point[],
  baseY: number,
): string {
  const last = pts[pts.length - 1] ?? [0, 0];
  const first = pts[0] ?? [0, 0];
  return `${linePath} L${r2(last[0])},${r2(baseY)} L${r2(first[0])},${r2(baseY)} Z`;
}

/** A "nice" round step near `rough` (1/2/2.5/3/5/10 × 10^n). */
export function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let s: number;
  if (norm <= 1) s = 1;
  else if (norm <= 2) s = 2;
  else if (norm <= 2.5) s = 2.5;
  else if (norm <= 3) s = 3;
  else if (norm <= 5) s = 5;
  else s = 10;
  return s * mag;
}

/**
 * Auto axis from data — a nice max + tick array, robust to any magnitude and
 * to a deficit floor (negative min grows the axis left of zero). Values are in
 * the chart's native unit (cents or euros — caller's choice, kept consistent).
 */
export function niceAxis(
  maxVal: number,
  minVal = 0,
): { max: number; min: number; ticks: number[] } {
  minVal = Math.min(0, minVal);
  const step = niceStep(Math.max(maxVal, -minVal) / 3) || 1;
  const max = Math.max(step, Math.ceil(maxVal / step) * step);
  const min = minVal < 0 ? -Math.ceil(-minVal / (step / 2)) * (step / 2) : 0;
  const ticks: number[] = [];
  for (let t = 0; t <= max + 1e-6; t += step) ticks.push(Math.round(t));
  // Dedupe — a sub-unit step (degenerate, near-zero data) can round two ticks
  // to the same integer, which would collide as `{#each}` keys.
  return { max, min, ticks: [...new Set(ticks)] };
}

/**
 * Point on a 180° top-half gauge for fraction `f ∈ [0,1]` (0 = left end,
 * 1 = right end, 0.5 = apex). Used by the §64 Freigrenze arc gauge.
 */
export function gaugePoint(
  cx: number,
  cy: number,
  radius: number,
  f: number,
): Point {
  const a = Math.PI * (1 - f);
  return [cx + radius * Math.cos(a), cy - radius * Math.sin(a)];
}

/** Arc path along the gauge from fraction `f0` to `f1` (sweep clockwise). */
export function gaugeArc(
  cx: number,
  cy: number,
  radius: number,
  f0: number,
  f1: number,
): string {
  const large = f1 - f0 > 0.5 ? 1 : 0;
  const [x0, y0] = gaugePoint(cx, cy, radius, f0);
  const [x1, y1] = gaugePoint(cx, cy, radius, f1);
  return `M${r2(x0)},${r2(y0)} A${radius},${radius} 0 ${large} 1 ${r2(x1)},${r2(y1)}`;
}

/**
 * Progress-ring dash for a top-anchored circle: returns circumference and the
 * dash offset that leaves `pct` (0–100) of the ring filled clockwise.
 */
export function ringDash(
  radius: number,
  pct: number,
): { circumference: number; offset: number } {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(pct, 100));
  return { circumference, offset: circumference * (1 - clamped / 100) };
}

/** Clamp a number to `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
