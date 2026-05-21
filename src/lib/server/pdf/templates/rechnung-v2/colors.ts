/**
 * Phase 10 — Rechnung v2 brand colors.
 *
 * Extracted from the Verein's docx XML (Downloads/Template (1).docx) +
 * post-design-review adjustments for contrast.
 *
 *   - Primary rosa  → #f09dff (RECHNUNG wordmark + "RECHNUNG NR." heading)
 *   - Deep rosa     → #e275f4 (table header bar + Gesamtsumme value cell;
 *                     darker so white text reads with ≥4:1 contrast)
 *   - Soft rosa     → #f5beff (Gesamtsumme LABEL cell background — paired
 *                     with WHITE text → use only for fills, never as a text color)
 *   - Body          → #000028 (almost-black, faint navy — body text)
 *   - White         → #ffffff (text on deep + soft rosa backgrounds)
 *
 * Contrast rule (design-review):
 *   - White text MUST go on BRAND_ROSA_DEEP or BRAND_ROSA (≥3.5:1)
 *   - BRAND_ROSA_SOFT may be used as a fill ONLY with BODY text (≥4:1)
 *   - Footer accent (Steuernummer value) MUST be BRAND_ROSA, NEVER soft
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
export const BRAND_ROSA_DEEP = hex("#e275f4");
export const BRAND_ROSA_SOFT = hex("#f5beff");
export const BODY = hex("#000028");
export const WHITE = rgb(1, 1, 1);
