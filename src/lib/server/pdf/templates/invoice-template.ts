/**
 * Programmatic invoice layout — pdf-lib coordinate math + drawing primitives.
 *
 * Keeps drawing concerns out of the renderer module so the renderer can stay
 * a thin orchestrator. Layout uses A4 portrait, mm-based units converted to
 * the PDF default of points (1pt = 1/72in ≈ 0.353mm).
 *
 * Design notes (Andy wants pretty):
 *   - Header bar in the verein's rosa accent
 *   - Customer block top-left, verein meta top-right
 *   - Section dividers in a soft pink rule colour
 *   - Right-aligned totals with a thicker rule under brutto
 *   - Footer prints Steuernummer / VR / IBAN once at the bottom
 */

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";
import type { InvoiceRenderInput, InvoicePdfLineItem } from "../invoice.js";

// ── Geometry ──────────────────────────────────────────────────────────────
const MM_TO_PT = 72 / 25.4;
const mm = (n: number): number => n * MM_TO_PT;

// A4 portrait in points (210 × 297 mm)
const PAGE_W = mm(210);
const PAGE_H = mm(297);

const MARGIN_X = mm(20);
const MARGIN_BOTTOM = mm(20);

// ── Palette (rosa-themed; mirrors the mail templates) ─────────────────────
const COLOR_PRIMARY: RGB = rgb(0.61, 0.16, 0.43);
const COLOR_PRIMARY_SOFT: RGB = rgb(0.99, 0.93, 0.96);
const COLOR_TEXT: RGB = rgb(0.12, 0.12, 0.16);
const COLOR_MUTED: RGB = rgb(0.45, 0.45, 0.52);
const COLOR_RULE: RGB = rgb(0.91, 0.78, 0.86);

// ── Type sizes ────────────────────────────────────────────────────────────
const SIZE_HEADER_VEREIN = 11;
const SIZE_TITLE = 18;
const SIZE_BODY = 10;
const SIZE_SMALL = 8.5;
const SIZE_FOOTER = 8;

/** Format euros (cents) into a German "1.234,56 €" string. */
export function formatEuro(cents: number, currency: string = "EUR"): string {
  const eur = cents / 100;
  return eur.toLocaleString("de-DE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format an ISO date (YYYY-MM-DD) as DD.MM.YYYY for invoices. */
export function formatGermanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/** Word-wrap a string to fit within `maxWidth` points using the given font/size. */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (font.widthOfTextAtSize(rawLine, size) <= maxWidth) {
      lines.push(rawLine);
      continue;
    }
    let current = "";
    for (const word of rawLine.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

/** Draw lines of text and return the y-coordinate below the block. */
function drawLines(
  ctx: DrawCtx,
  x: number,
  yStart: number,
  lines: string[],
  opts: {
    font?: PDFFont;
    size?: number;
    color?: RGB;
    lineGap?: number;
  } = {},
): number {
  const f = opts.font ?? ctx.font;
  const size = opts.size ?? SIZE_BODY;
  const color = opts.color ?? COLOR_TEXT;
  const gap = opts.lineGap ?? 1.3;
  const lineH = size * gap;
  let y = yStart;
  for (const line of lines) {
    ctx.page.drawText(line, { x, y, size, font: f, color });
    y -= lineH;
  }
  return y;
}

/** Draw a horizontal rule. */
function drawRule(
  ctx: DrawCtx,
  x1: number,
  x2: number,
  y: number,
  color: RGB = COLOR_RULE,
  thickness: number = 0.6,
): void {
  ctx.page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness,
    color,
  });
}

/**
 * Render the invoice onto a fresh A4 page of the given PDFDocument.
 * Returns the populated PDFPage so the caller can serialize the doc.
 */
export async function drawInvoice(
  doc: PDFDocument,
  input: InvoiceRenderInput,
): Promise<PDFPage> {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: DrawCtx = { page, font, bold };

  // ── 1. Header bar with verein name + title ─────────────────────────────
  const headerH = mm(18);
  const headerY = PAGE_H - headerH;
  page.drawRectangle({
    x: 0,
    y: headerY,
    width: PAGE_W,
    height: headerH,
    color: COLOR_PRIMARY,
  });
  page.drawText(input.verein.name, {
    x: MARGIN_X,
    y: PAGE_H - mm(11),
    size: SIZE_HEADER_VEREIN + 4,
    font: bold,
    color: rgb(1, 1, 1),
  });
  const titleLabel = "Rechnung";
  page.drawText(titleLabel, {
    x: PAGE_W - MARGIN_X - bold.widthOfTextAtSize(titleLabel, SIZE_TITLE + 2),
    y: PAGE_H - mm(12),
    size: SIZE_TITLE + 2,
    font: bold,
    color: rgb(1, 1, 1),
  });

  // ── 2. Two-column block: customer (left) + verein meta (right) ─────────
  const blockTop = headerY - mm(12);
  const colRightX = mm(120);

  let y = blockTop;
  y = drawLines(ctx, MARGIN_X, y, ["RECHNUNG AN"], {
    font: bold,
    size: SIZE_SMALL,
    color: COLOR_MUTED,
    lineGap: 1.5,
  });
  y -= mm(1.5);
  y = drawLines(ctx, MARGIN_X, y, [input.customer.name], {
    font: bold,
    size: SIZE_BODY + 1,
    color: COLOR_TEXT,
    lineGap: 1.3,
  });
  if (input.customer.addressBlock) {
    const addrLines = input.customer.addressBlock.split(/\r?\n/);
    y = drawLines(ctx, MARGIN_X, y, addrLines, {
      size: SIZE_BODY,
      color: COLOR_TEXT,
      lineGap: 1.35,
    });
  }

  let yR = blockTop;
  const drawMetaRow = (label: string, value: string): void => {
    page.drawText(label, {
      x: colRightX,
      y: yR,
      size: SIZE_SMALL,
      font: font,
      color: COLOR_MUTED,
    });
    page.drawText(value, {
      x: colRightX + mm(30),
      y: yR,
      size: SIZE_BODY,
      font: bold,
      color: COLOR_TEXT,
    });
    yR -= mm(5);
  };
  drawMetaRow("Rechnungs-Nr.", input.invoiceNumber);
  drawMetaRow("Rechnungsdatum", formatGermanDate(input.rechnungsdatum));
  if (input.leistungsDatum) {
    drawMetaRow("Leistungsdatum", formatGermanDate(input.leistungsDatum));
  }
  if (input.faelligkeitsDatum) {
    drawMetaRow("Faellig bis", formatGermanDate(input.faelligkeitsDatum));
  }

  y = Math.min(y, yR) - mm(6);

  // ── 3. Bezeichnung / Leistungsbeschreibung headline ────────────────────
  drawRule(ctx, MARGIN_X, PAGE_W - MARGIN_X, y);
  y -= mm(8);

  page.drawText(input.bezeichnung, {
    x: MARGIN_X,
    y,
    size: SIZE_TITLE - 2,
    font: bold,
    color: COLOR_PRIMARY,
  });
  y -= mm(8);

  if (input.leistungsBeschreibung && input.leistungsBeschreibung.trim()) {
    const wrappedDesc = wrapText(
      input.leistungsBeschreibung,
      font,
      SIZE_BODY,
      PAGE_W - 2 * MARGIN_X,
    );
    y = drawLines(ctx, MARGIN_X, y, wrappedDesc, {
      size: SIZE_BODY,
      color: COLOR_TEXT,
      lineGap: 1.4,
    });
    y -= mm(2);
  }

  // ── 4. Line items table ────────────────────────────────────────────────
  y -= mm(2);
  drawRule(ctx, MARGIN_X, PAGE_W - MARGIN_X, y, COLOR_PRIMARY, 0.8);
  y -= mm(5);

  const colAmountX = PAGE_W - MARGIN_X;
  page.drawText("Beschreibung", {
    x: MARGIN_X,
    y,
    size: SIZE_SMALL,
    font: bold,
    color: COLOR_MUTED,
  });
  const amountLabel = "Netto";
  page.drawText(amountLabel, {
    x: colAmountX - bold.widthOfTextAtSize(amountLabel, SIZE_SMALL),
    y,
    size: SIZE_SMALL,
    font: bold,
    color: COLOR_MUTED,
  });
  y -= mm(4);
  drawRule(ctx, MARGIN_X, PAGE_W - MARGIN_X, y);
  y -= mm(4);

  for (const item of input.lineItems) {
    y = drawLineItem(ctx, item, y, input.currency);
  }

  // ── 5. Totals (right-aligned) ──────────────────────────────────────────
  y -= mm(2);
  drawRule(ctx, mm(110), PAGE_W - MARGIN_X, y);
  y -= mm(5);

  const drawTotalRow = (
    label: string,
    valueCents: number,
    opts: { bold?: boolean; size?: number; thickRule?: boolean } = {},
  ): void => {
    const size = opts.size ?? SIZE_BODY;
    const f = opts.bold ? bold : font;
    const labelX = mm(115);
    page.drawText(label, {
      x: labelX,
      y,
      size,
      font: f,
      color: COLOR_TEXT,
    });
    const valueStr = formatEuro(valueCents, input.currency);
    page.drawText(valueStr, {
      x: colAmountX - f.widthOfTextAtSize(valueStr, size),
      y,
      size,
      font: f,
      color: COLOR_TEXT,
    });
    y -= mm(opts.thickRule ? 6 : 5);
    if (opts.thickRule) {
      drawRule(
        ctx,
        mm(110),
        PAGE_W - MARGIN_X,
        y + mm(1.5),
        COLOR_PRIMARY,
        0.8,
      );
    }
  };

  drawTotalRow("Netto", input.nettoCents);
  if (input.ustCents !== 0) {
    drawTotalRow("Umsatzsteuer", input.ustCents);
  }
  drawTotalRow("Gesamtbetrag", input.bruttoCents, {
    bold: true,
    size: SIZE_BODY + 2,
    thickRule: true,
  });

  // ── 6. Footer note (mid-page) ──────────────────────────────────────────
  y -= mm(8);
  if (input.footerNote && input.footerNote.trim()) {
    const wrappedFooter = wrapText(
      input.footerNote,
      font,
      SIZE_BODY,
      PAGE_W - 2 * MARGIN_X,
    );
    drawLines(ctx, MARGIN_X, y, wrappedFooter, {
      size: SIZE_BODY,
      color: COLOR_TEXT,
      lineGap: 1.4,
    });
  }

  // ── 7. Banking + verein footer at the bottom of the page ───────────────
  const footerY = MARGIN_BOTTOM + mm(15);
  drawRule(ctx, MARGIN_X, PAGE_W - MARGIN_X, footerY + mm(10));

  const footerLeft: string[] = [
    input.verein.name,
    ...input.verein.adresse.split(/\r?\n/),
  ];
  drawLines(ctx, MARGIN_X, footerY + mm(7), footerLeft, {
    size: SIZE_FOOTER,
    color: COLOR_MUTED,
    lineGap: 1.3,
  });

  const footerMid: string[] = [
    `Steuernummer: ${input.verein.steuernummer || "-"}`,
    `Register: ${input.verein.vereinsregister || "-"}`,
  ];
  drawLines(ctx, mm(85), footerY + mm(7), footerMid, {
    size: SIZE_FOOTER,
    color: COLOR_MUTED,
    lineGap: 1.3,
  });

  const footerRight: string[] = [];
  if (input.verein.iban) footerRight.push(`IBAN: ${input.verein.iban}`);
  if (input.verein.bic) footerRight.push(`BIC: ${input.verein.bic}`);
  if (input.verein.bank) footerRight.push(input.verein.bank);
  if (footerRight.length > 0) {
    drawLines(ctx, mm(140), footerY + mm(7), footerRight, {
      size: SIZE_FOOTER,
      color: COLOR_MUTED,
      lineGap: 1.3,
    });
  }

  // soft accent stripe at the page bottom
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_W,
    height: mm(3),
    color: COLOR_PRIMARY_SOFT,
  });

  return page;
}

function drawLineItem(
  ctx: DrawCtx,
  item: InvoicePdfLineItem,
  yStart: number,
  currency: string,
): number {
  let y = yStart;
  const colAmountX = PAGE_W - MARGIN_X;

  const descLines = wrapText(item.beschreibung, ctx.font, SIZE_BODY, mm(120));

  const valueStr = formatEuro(item.nettoCents, currency);
  ctx.page.drawText(valueStr, {
    x: colAmountX - ctx.bold.widthOfTextAtSize(valueStr, SIZE_BODY),
    y,
    size: SIZE_BODY,
    font: ctx.bold,
    color: COLOR_TEXT,
  });

  y = drawLines(ctx, MARGIN_X, y, descLines, {
    size: SIZE_BODY,
    color: COLOR_TEXT,
    lineGap: 1.4,
  });
  return y - mm(2);
}
