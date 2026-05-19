/**
 * EÜR PDF generator — rosa-themed A4 summary of the Einnahmen-Überschuss-Rechnung.
 *
 * Produces a single-page (or multi-page for large data) PDF with:
 *   - Rosa header bar with Verein name + year
 *   - Per-sphere table: Einnahmen / Ausgaben / Überschuss
 *   - Grand totals with a thicker rule
 *
 * Palette and geometry conventions match the invoice template.
 */

import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { EurYearResult } from "$lib/server/domain/eur.js";
import {
  formatEurCents,
  SPHERE_LABELS,
  SPHERES,
} from "$lib/server/domain/eur.js";

// ── Geometry ──────────────────────────────────────────────────────────────────
const MM_TO_PT = 72 / 25.4;
const mm = (n: number): number => n * MM_TO_PT;

const PAGE_W = mm(210);
const PAGE_H = mm(297);
const MARGIN_X = mm(20);
const MARGIN_TOP = mm(20);
const MARGIN_BOTTOM = mm(20);

// ── Palette (rosa, matching invoice template) ─────────────────────────────────
const COLOR_PRIMARY: RGB = rgb(0.61, 0.16, 0.43);
const COLOR_PRIMARY_SOFT: RGB = rgb(0.99, 0.93, 0.96);
const COLOR_TEXT: RGB = rgb(0.12, 0.12, 0.16);
const COLOR_MUTED: RGB = rgb(0.45, 0.45, 0.52);
const COLOR_RULE: RGB = rgb(0.91, 0.78, 0.86);
const COLOR_POSITIVE: RGB = rgb(0.1, 0.5, 0.2);
const COLOR_NEGATIVE: RGB = rgb(0.7, 0.1, 0.1);

const SIZE_HEADER = 14;
const SIZE_SUBHEADER = 10;
const SIZE_BODY = 10;
const SIZE_SMALL = 8.5;
const SIZE_FOOTER = 8;

// ── Column layout ─────────────────────────────────────────────────────────────
const COL_SPHERE = MARGIN_X;
const COL_EINNAHMEN = mm(110);
const COL_AUSGABEN = mm(148);
const COL_UEBERSCHUSS = mm(175);
const CONTENT_W = PAGE_W - MARGIN_X * 2;

/**
 * Generate EÜR summary PDF as Uint8Array.
 */
export async function generateEurPdf(
  eur: EurYearResult,
  vereinName: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`EÜR ${eur.year} — ${vereinName}`);
  doc.setSubject(`Einnahmen-Überschuss-Rechnung ${eur.year}`);
  doc.setAuthor(vereinName);
  doc.setProducer("folgederwolke-app");
  doc.setCreationDate(new Date());

  const page = doc.addPage([PAGE_W, PAGE_H]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = PAGE_H - MARGIN_TOP;

  // ── Rosa header bar ────────────────────────────────────────────────────────
  const headerH = mm(18);
  page.drawRectangle({
    x: 0,
    y: PAGE_H - headerH,
    width: PAGE_W,
    height: headerH,
    color: COLOR_PRIMARY,
  });

  page.drawText("Einnahmen-Überschuss-Rechnung", {
    x: MARGIN_X,
    y: PAGE_H - mm(8),
    size: SIZE_HEADER,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`${vereinName} · Buchungsjahr ${eur.year}`, {
    x: MARGIN_X,
    y: PAGE_H - mm(14),
    size: SIZE_SUBHEADER,
    font,
    color: rgb(0.95, 0.88, 0.94),
  });

  y = PAGE_H - headerH - mm(8);

  // ── Generated-at line ──────────────────────────────────────────────────────
  const generatedAt = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  page.drawText(`Erstellt am ${generatedAt} · Alle Beträge in EUR`, {
    x: MARGIN_X,
    y,
    size: SIZE_SMALL,
    font,
    color: COLOR_MUTED,
  });
  y -= mm(8);

  // ── Column headers ─────────────────────────────────────────────────────────
  page.drawRectangle({
    x: MARGIN_X,
    y: y - mm(7),
    width: CONTENT_W,
    height: mm(7),
    color: COLOR_PRIMARY_SOFT,
  });

  const drawColHeader = (text: string, x: number, rightAlign = false): void => {
    const w = rightAlign ? mm(30) : mm(80);
    const textW = bold.widthOfTextAtSize(text, SIZE_SMALL);
    const xPos = rightAlign ? x + w - textW : x + 2;
    page.drawText(text, {
      x: xPos,
      y: y - mm(5),
      size: SIZE_SMALL,
      font: bold,
      color: COLOR_TEXT,
    });
  };

  drawColHeader("Sphäre", COL_SPHERE);
  drawColHeader("Einnahmen", COL_EINNAHMEN, true);
  drawColHeader("Ausgaben", COL_AUSGABEN, true);
  drawColHeader("Überschuss", COL_UEBERSCHUSS, true);
  y -= mm(9);

  // ── Per-sphere rows ────────────────────────────────────────────────────────
  const drawRule = (yPos: number, thick = false): void => {
    page.drawLine({
      start: { x: MARGIN_X, y: yPos },
      end: { x: PAGE_W - MARGIN_X, y: yPos },
      thickness: thick ? 1.2 : 0.5,
      color: thick ? COLOR_PRIMARY : COLOR_RULE,
    });
  };

  const drawAmountRight = (
    amountCents: bigint,
    x: number,
    yPos: number,
    opts: { bold?: boolean; color?: RGB } = {},
  ): void => {
    const text = formatEurCents(amountCents);
    const f = opts.bold ? bold : font;
    const textW = f.widthOfTextAtSize(text, SIZE_BODY);
    const color = opts.color ?? COLOR_TEXT;
    page.drawText(text, {
      x: x + mm(30) - textW,
      y: yPos,
      size: SIZE_BODY,
      font: f,
      color,
    });
  };

  for (const sphere of SPHERES) {
    const sphereData = eur.bySphere[sphere];
    const label = SPHERE_LABELS[sphere];
    const { einnahmenCents, ausgabenCents, ueberschussCents } =
      sphereData.totals;

    // Row background (alternating)
    const rowIdx = SPHERES.indexOf(sphere);
    if (rowIdx % 2 === 1) {
      page.drawRectangle({
        x: MARGIN_X,
        y: y - mm(6),
        width: CONTENT_W,
        height: mm(7),
        color: rgb(0.98, 0.97, 0.98),
      });
    }

    page.drawText(label, {
      x: COL_SPHERE + 2,
      y,
      size: SIZE_BODY,
      font,
      color: COLOR_TEXT,
    });

    drawAmountRight(einnahmenCents, COL_EINNAHMEN, y);
    drawAmountRight(ausgabenCents, COL_AUSGABEN, y);

    const ueberschussColor =
      ueberschussCents >= 0n ? COLOR_POSITIVE : COLOR_NEGATIVE;
    drawAmountRight(
      ueberschussCents < 0n ? -ueberschussCents : ueberschussCents,
      COL_UEBERSCHUSS,
      y,
      {
        color: ueberschussColor,
      },
    );

    // Small detail: row count
    const einnahmenCount = sphereData.einnahmen.length;
    const ausgabenCount = sphereData.ausgaben.length;
    page.drawText(
      `${einnahmenCount} Buchung${einnahmenCount !== 1 ? "en" : ""} · ${ausgabenCount} Ausgabe${ausgabenCount !== 1 ? "n" : ""}`,
      {
        x: COL_SPHERE + 2,
        y: y - mm(4),
        size: SIZE_SMALL,
        font,
        color: COLOR_MUTED,
      },
    );

    y -= mm(10);
    drawRule(y);
    y -= mm(2);
  }

  // ── Grand totals ───────────────────────────────────────────────────────────
  y -= mm(2);
  drawRule(y, true);
  y -= mm(6);

  page.drawText("GESAMT", {
    x: COL_SPHERE + 2,
    y,
    size: SIZE_BODY,
    font: bold,
    color: COLOR_PRIMARY,
  });

  drawAmountRight(eur.totalEinnahmenCents, COL_EINNAHMEN, y, { bold: true });
  drawAmountRight(eur.totalAusgabenCents, COL_AUSGABEN, y, { bold: true });

  const totalUeberschussColor =
    eur.totalUeberschussCents >= 0n ? COLOR_POSITIVE : COLOR_NEGATIVE;
  drawAmountRight(
    eur.totalUeberschussCents < 0n
      ? -eur.totalUeberschussCents
      : eur.totalUeberschussCents,
    COL_UEBERSCHUSS,
    y,
    { bold: true, color: totalUeberschussColor },
  );

  y -= mm(8);
  drawRule(y, true);
  y -= mm(6);

  // ── Legal note ────────────────────────────────────────────────────────────
  page.drawText(
    "Gemeinnützigkeitsstatus: Ideeller Bereich + Vermögensverwaltung + Zweckbetrieb steuerfrei.",
    {
      x: MARGIN_X,
      y,
      size: SIZE_SMALL,
      font,
      color: COLOR_MUTED,
    },
  );
  y -= mm(4);
  page.drawText(
    "Wirtschaftlicher Geschäftsbetrieb: steuerfrei unterhalb Freigrenze 50.000 € (§ 64 Abs. 3 AO, ab 2025).",
    {
      x: MARGIN_X,
      y,
      size: SIZE_SMALL,
      font,
      color: COLOR_MUTED,
    },
  );

  // ── Footer ────────────────────────────────────────────────────────────────
  page.drawText(
    `${vereinName} · Buchungsjahr ${eur.year} · Aufbewahrungspflicht 10 Jahre (§ 147 AO)`,
    {
      x: MARGIN_X,
      y: MARGIN_BOTTOM,
      size: SIZE_FOOTER,
      font,
      color: COLOR_MUTED,
    },
  );

  return doc.save();
}
