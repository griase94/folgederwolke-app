/**
 * Phase 10 — Rechnung v2 brand colors.
 *
 * Extracted from the Verein's docx XML (Downloads/Template (1).docx):
 *   - Primary rosa  → #f09dff (RECHNUNG wordmark + "RECHNUNG NR." heading
 *                     + table header bar + Gesamtsumme value cell)
 *   - Soft rosa     → #f5beff (Gesamtsumme label cell + cell divider line)
 *   - Body          → #000028 (almost-black, faint navy — body text)
 *   - White         → #ffffff (text on rosa backgrounds)
 */
import { rgb, type RGB } from "pdf-lib";

const hex = (h: string): RGB => {
  const clean = h.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
};

export const BRAND_ROSA = hex("#f09dff");
export const BRAND_ROSA_SOFT = hex("#f5beff");
export const BODY = hex("#000028");
export const WHITE = rgb(1, 1, 1);
