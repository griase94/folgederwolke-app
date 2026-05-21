/**
 * Phase 10 — Rechnung v2 renderer.
 *
 * Pixel-faithful reproduction of the Verein's brand template:
 *   - Lavender-pink "RECHNUNG" wordmark (Anton 36pt) + cloud-lightning logo
 *   - 10pt DejaVu Sans body
 *   - Pink table header bar + Gesamtsumme pill
 *   - 4-column footer with line-art icons
 *
 * See the addendum to `.claude/plans/2026-05-21-rechnung-redesign.md` for
 * the full layout spec. Renderer is self-contained: it loads fonts and
 * images via the cached loaders in `fonts.ts` and `assets.ts`, then draws
 * everything per-document via pdf-lib's drawing primitives.
 */
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  type RGB,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { loadFontBytes } from "./fonts.js";
import { loadAssetBytes } from "./assets.js";
import { BRAND_ROSA, BRAND_ROSA_SOFT, BODY, WHITE } from "./colors.js";

// Geometry
const MM = 72 / 25.4;
const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_TOP = 10 * MM;
const MARGIN_BOTTOM = 10 * MM;
const MARGIN_LEFT = 20 * MM;
const MARGIN_RIGHT = 10 * MM;
const CONTENT_W = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

// Font sizes (pt)
const SIZE_WORDMARK = 36;
const SIZE_SUBTITLE_BOLD = 9;
const SIZE_SUBTITLE_ITALIC = 8;
const SIZE_ADDRESS = 10;
const SIZE_META_LABEL = 10;
const SIZE_META_VALUE = 10;
const SIZE_SECTION_TITLE = 11;
const SIZE_BODY = 10;
const SIZE_TABLE_HEADER = 10;
const SIZE_TABLE_CELL = 10;
const SIZE_FOOTER = 8;

// Input contract
export interface RechnungV2Input {
  verein: {
    name: string;
    adresseSingleLine: string;
    adresseLine1: string;
    adresseLine2: string;
    vereinsregister: string;
    steuernummer: string;
    kontaktPerson: string;
    contactPhone: string;
    contactEmail: string;
    bankname: string;
    iban: string;
    bic: string;
  };
  customer: {
    name: string;
    addressBlock: string;
    country: string;
  };
  rechnungsnummer: string;
  rechnungsdatum: string;
  leistungszeitraum: string | null;
  bezeichnung: string;
  leistungsBeschreibung: string | null;
  nettoCents: number;
  kassenwaertName: string;
}

// Helpers

const ALPHA2_TO_DE: Record<string, string> = {
  DE: "Deutschland",
  AT: "Österreich",
  CH: "Schweiz",
  FR: "Frankreich",
  IT: "Italien",
  NL: "Niederlande",
  BE: "Belgien",
  LU: "Luxemburg",
  GB: "Vereinigtes Königreich",
  UK: "Vereinigtes Königreich",
  US: "Vereinigte Staaten",
  ES: "Spanien",
  PL: "Polen",
  CZ: "Tschechien",
  SK: "Slowakei",
  HU: "Ungarn",
  DK: "Dänemark",
  SE: "Schweden",
  FI: "Finnland",
  NO: "Norwegen",
  IE: "Irland",
  PT: "Portugal",
  GR: "Griechenland",
  RO: "Rumänien",
  BG: "Bulgarien",
  HR: "Kroatien",
  SI: "Slowenien",
  EE: "Estland",
  LV: "Lettland",
  LT: "Litauen",
  TR: "Türkei",
};

export function countryLabelForAlpha2(code: string): string {
  const c = (code ?? "").trim().toUpperCase();
  return ALPHA2_TO_DE[c] ?? c;
}

export function formatEur(cents: number): string {
  const eur = cents / 100;
  return eur
    .toLocaleString("de-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    })
    .replace(/ /g, " ");
}

export function formatDE(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.test(iso);
  if (!m) return iso;
  const year = iso.slice(0, 4);
  const month = iso.slice(5, 7);
  const day = iso.slice(8, 10);
  return `${day}.${month}.${year}`;
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (font.widthOfTextAtSize(raw, size) <= maxWidth) {
      lines.push(raw);
      continue;
    }
    let current = "";
    for (const word of raw.split(/\s+/)) {
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

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  color: RGB,
): void {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawCenteredImage(
  page: PDFPage,
  img: PDFImage,
  centerX: number,
  y: number,
  maxW: number,
  maxH: number,
): void {
  const ratio = img.width / img.height;
  let w = maxW;
  let h = maxW / ratio;
  if (h > maxH) {
    h = maxH;
    w = maxH * ratio;
  }
  page.drawImage(img, { x: centerX - w / 2, y, width: w, height: h });
}

// Main renderer

export async function renderRechnungV2(
  input: RechnungV2Input,
): Promise<Uint8Array> {
  const fonts = await loadFontBytes();
  const assets = await loadAssetBytes();

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Rechnung ${input.rechnungsnummer}`);
  doc.setSubject(`Rechnung an ${input.customer.name}`);
  doc.setAuthor(input.verein.name);
  doc.setProducer("folgederwolke-app");
  doc.setCreationDate(new Date());

  const anton = await doc.embedFont(fonts.anton, { subset: true });
  const regular = await doc.embedFont(fonts.dejavu, { subset: true });
  const bold = await doc.embedFont(fonts.dejavuBold, { subset: true });
  const italic = await doc.embedFont(fonts.dejavuOblique, { subset: true });

  const logo = await doc.embedPng(assets.logoCloud);
  const iconHouse = await doc.embedPng(assets.iconHouse);
  const iconContact = await doc.embedPng(assets.iconContact);
  const iconBank = await doc.embedPng(assets.iconBank);
  const iconPerson = await doc.embedPng(assets.iconPerson);

  const page = doc.addPage([PAGE_W, PAGE_H]);

  // 1. Header band
  const wordmarkBaselineY = PAGE_H - MARGIN_TOP - 23 * MM;
  page.drawText("RECHNUNG", {
    x: MARGIN_LEFT,
    y: wordmarkBaselineY,
    size: SIZE_WORDMARK,
    font: anton,
    color: BRAND_ROSA,
  });

  const subtitleBoldY = wordmarkBaselineY - 4.5 * MM;
  page.drawText(`${input.verein.name} - ${input.verein.adresseSingleLine}`, {
    x: MARGIN_LEFT,
    y: subtitleBoldY,
    size: SIZE_SUBTITLE_BOLD,
    font: bold,
    color: BODY,
  });

  const subtitleItalicY = subtitleBoldY - 3.5 * MM;
  page.drawText(
    `eingetragen im Vereinsregister des AG München unter ${input.verein.vereinsregister}`,
    {
      x: MARGIN_LEFT,
      y: subtitleItalicY,
      size: SIZE_SUBTITLE_ITALIC,
      font: italic,
      color: BODY,
    },
  );

  const logoBoxW = 22 * MM;
  const logoBoxH = 22 * MM;
  const logoX = PAGE_W - MARGIN_RIGHT - logoBoxW;
  const logoY = PAGE_H - MARGIN_TOP - logoBoxH - 2 * MM;
  drawCenteredImage(
    page,
    logo,
    logoX + logoBoxW / 2,
    logoY,
    logoBoxW,
    logoBoxH,
  );

  // 2. Address block + meta block
  const addressTopY = PAGE_H - MARGIN_TOP - 53 * MM;
  const addressLeftX = MARGIN_LEFT;
  const addressMaxW = 80 * MM;
  const addressLineH = 5 * MM;

  const customerLines: string[] = [];
  customerLines.push(input.customer.name);
  const blockLines = (input.customer.addressBlock ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  customerLines.push(...blockLines);
  if (input.customer.country && input.customer.country.toUpperCase() !== "DE") {
    customerLines.push(countryLabelForAlpha2(input.customer.country));
  }

  let addressY = addressTopY;
  for (const line of customerLines) {
    page.drawText(line, {
      x: addressLeftX,
      y: addressY,
      size: SIZE_ADDRESS,
      font: regular,
      color: BODY,
      maxWidth: addressMaxW,
    });
    addressY -= addressLineH;
  }

  // Meta block
  const metaRightX = PAGE_W - MARGIN_RIGHT;
  const metaLabelLeftX = MARGIN_LEFT + 95 * MM;
  const metaTopY = addressTopY;
  const metaRowH = 5 * MM;

  const metaRows: Array<{ label: string; value: string }> = [
    { label: "Rechnung Nr.:", value: input.rechnungsnummer },
    { label: "Rechnungsdatum:", value: formatDE(input.rechnungsdatum) },
  ];
  if (input.leistungszeitraum && input.leistungszeitraum.trim().length > 0) {
    metaRows.push({
      label: "Leistungszeitraum:",
      value: input.leistungszeitraum.trim(),
    });
  }

  let metaY = metaTopY;
  for (const row of metaRows) {
    const labelW = bold.widthOfTextAtSize(row.label, SIZE_META_LABEL);
    const valueW = regular.widthOfTextAtSize(row.value, SIZE_META_VALUE);
    const valueX = metaRightX - valueW;
    const labelX = Math.max(metaLabelLeftX, valueX - 8 * MM - labelW);
    page.drawText(row.label, {
      x: labelX,
      y: metaY,
      size: SIZE_META_LABEL,
      font: bold,
      color: BODY,
    });
    page.drawText(row.value, {
      x: valueX,
      y: metaY,
      size: SIZE_META_VALUE,
      font: regular,
      color: BODY,
    });
    metaY -= metaRowH;
  }

  // 3. Section title
  const sectionTitleY = addressY - 10 * MM;
  page.drawText(`RECHNUNG NR. ${input.rechnungsnummer}`, {
    x: MARGIN_LEFT,
    y: sectionTitleY,
    size: SIZE_SECTION_TITLE,
    font: bold,
    color: BRAND_ROSA,
  });

  // 4. Greeting + intro
  let bodyY = sectionTitleY - 12 * MM;
  page.drawText("Sehr geehrte Damen und Herren,", {
    x: MARGIN_LEFT,
    y: bodyY,
    size: SIZE_BODY,
    font: regular,
    color: BODY,
  });
  bodyY -= 7 * MM;
  page.drawText(
    "vielen Dank für Ihr Vertrauen. Ich stelle Ihnen hiermit folgende Leistungen in Rechnung:",
    {
      x: MARGIN_LEFT,
      y: bodyY,
      size: SIZE_BODY,
      font: regular,
      color: BODY,
    },
  );

  // 5. Table
  const tableX = MARGIN_LEFT;
  const tableW = CONTENT_W;
  const colPosW = 12 * MM;
  const colMengeW = 22 * MM;
  const colPreisW = 27 * MM;
  const colBeschrW = tableW - colPosW - colMengeW - colPreisW;
  const colPosX = tableX;
  const colBeschrX = colPosX + colPosW;
  const colMengeX = colBeschrX + colBeschrW;
  const colPreisX = colMengeX + colMengeW;
  const colPreisRightX = colPreisX + colPreisW;

  const tableTopY = bodyY - 10 * MM;
  const headerH = 7 * MM;

  drawRect(page, tableX, tableTopY - headerH, tableW, headerH, BRAND_ROSA);
  const headerTextY = tableTopY - headerH + 2.2 * MM;
  page.drawText("Pos.", {
    x: colPosX + 2 * MM,
    y: headerTextY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });
  page.drawText("Beschreibung", {
    x: colBeschrX + 2 * MM,
    y: headerTextY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });
  const mengeHdr = "Menge";
  const mengeHdrW = bold.widthOfTextAtSize(mengeHdr, SIZE_TABLE_HEADER);
  page.drawText(mengeHdr, {
    x: colMengeX + colMengeW - mengeHdrW - 2 * MM,
    y: headerTextY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });
  const preisHdr = "Gesamtpreis";
  const preisHdrW = bold.widthOfTextAtSize(preisHdr, SIZE_TABLE_HEADER);
  page.drawText(preisHdr, {
    x: colPreisRightX - preisHdrW - 2 * MM,
    y: headerTextY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });

  // Data row
  const dataTopY = tableTopY - headerH;
  const cellPadX = 2 * MM;
  const cellPadTop = 2.5 * MM;
  const lineH = 4.5 * MM;

  const beschrInnerW = colBeschrW - 2 * cellPadX;
  const wrappedBez = wrapText(
    input.bezeichnung,
    regular,
    SIZE_TABLE_CELL,
    beschrInnerW,
  );
  const hasSecondary =
    input.leistungsBeschreibung != null &&
    input.leistungsBeschreibung.trim().length > 0;
  const wrappedSec = hasSecondary
    ? wrapText(
        input.leistungsBeschreibung!,
        italic,
        SIZE_TABLE_CELL,
        beschrInnerW,
      )
    : [];

  const totalDataLines = wrappedBez.length + wrappedSec.length;
  const dataRowH = Math.max(8 * MM, cellPadTop * 2 + lineH * totalDataLines);
  const dataBottomY = dataTopY - dataRowH;

  const posText = "1.";
  const posW = regular.widthOfTextAtSize(posText, SIZE_TABLE_CELL);
  page.drawText(posText, {
    x: colPosX + (colPosW - posW) / 2,
    y: dataBottomY + dataRowH / 2 - SIZE_TABLE_CELL / 3,
    size: SIZE_TABLE_CELL,
    font: regular,
    color: BODY,
  });

  let bY = dataTopY - cellPadTop - SIZE_TABLE_CELL * 0.8;
  for (const line of wrappedBez) {
    page.drawText(line, {
      x: colBeschrX + cellPadX,
      y: bY,
      size: SIZE_TABLE_CELL,
      font: regular,
      color: BODY,
    });
    bY -= lineH;
  }
  for (const line of wrappedSec) {
    page.drawText(line, {
      x: colBeschrX + cellPadX,
      y: bY,
      size: SIZE_TABLE_CELL,
      font: italic,
      color: BODY,
    });
    bY -= lineH;
  }

  const mengeText = "1";
  const mengeW = regular.widthOfTextAtSize(mengeText, SIZE_TABLE_CELL);
  page.drawText(mengeText, {
    x: colMengeX + colMengeW - mengeW - cellPadX,
    y: dataBottomY + dataRowH / 2 - SIZE_TABLE_CELL / 3,
    size: SIZE_TABLE_CELL,
    font: regular,
    color: BODY,
  });

  const preisText = formatEur(input.nettoCents);
  const preisW = regular.widthOfTextAtSize(preisText, SIZE_TABLE_CELL);
  page.drawText(preisText, {
    x: colPreisRightX - preisW - cellPadX,
    y: dataBottomY + dataRowH / 2 - SIZE_TABLE_CELL / 3,
    size: SIZE_TABLE_CELL,
    font: regular,
    color: BODY,
  });

  // Soft-rosa divider line under the data row.
  page.drawRectangle({
    x: tableX,
    y: dataBottomY - 0.15 * MM,
    width: tableW,
    height: 0.3 * MM,
    color: BRAND_ROSA_SOFT,
  });

  // Gesamtsumme row
  const sumRowH = 7 * MM;
  const sumTopY = dataBottomY - 0.3 * MM;
  const sumBottomY = sumTopY - sumRowH;
  const sumLeftW = colPosW + colBeschrW + colMengeW;
  drawRect(page, tableX, sumBottomY, sumLeftW, sumRowH, BRAND_ROSA_SOFT);
  drawRect(page, colPreisX, sumBottomY, colPreisW, sumRowH, BRAND_ROSA);
  const sumLabel = "Gesamtsumme";
  const sumLabelW = bold.widthOfTextAtSize(sumLabel, SIZE_TABLE_HEADER);
  const sumLabelY = sumBottomY + sumRowH / 2 - SIZE_TABLE_HEADER / 3;
  page.drawText(sumLabel, {
    x: tableX + sumLeftW - sumLabelW - cellPadX,
    y: sumLabelY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });
  const sumValueW = bold.widthOfTextAtSize(preisText, SIZE_TABLE_HEADER);
  page.drawText(preisText, {
    x: colPreisRightX - sumValueW - cellPadX,
    y: sumLabelY,
    size: SIZE_TABLE_HEADER,
    font: bold,
    color: WHITE,
  });

  // 6. Body paragraphs after table
  let p = sumBottomY - 9 * MM;
  page.drawText("Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.", {
    x: MARGIN_LEFT,
    y: p,
    size: SIZE_BODY,
    font: italic,
    color: BODY,
  });
  p -= 7 * MM;
  page.drawText(
    "Zahlungsbedingungen: Zahlung innerhalb von 14 Tagen ab Rechnungseingang ohne Abzüge.",
    {
      x: MARGIN_LEFT,
      y: p,
      size: SIZE_BODY,
      font: regular,
      color: BODY,
    },
  );
  p -= 5 * MM;
  page.drawText(
    "Bei Rückfragen stehe ich selbstverständlich jederzeit gerne zur Verfügung.",
    {
      x: MARGIN_LEFT,
      y: p,
      size: SIZE_BODY,
      font: regular,
      color: BODY,
    },
  );
  p -= 9 * MM;
  page.drawText("Mit freundlichen Grüßen", {
    x: MARGIN_LEFT,
    y: p,
    size: SIZE_BODY,
    font: regular,
    color: BODY,
  });
  p -= 8 * MM;
  page.drawText(input.kassenwaertName, {
    x: MARGIN_LEFT,
    y: p,
    size: SIZE_BODY,
    font: bold,
    color: BODY,
  });
  p -= 4.5 * MM;
  page.drawText(`Kassenwärtin ${input.verein.name}`, {
    x: MARGIN_LEFT,
    y: p,
    size: SIZE_BODY,
    font: regular,
    color: BODY,
  });

  // Safety check: if y went below footer space, add a second page.
  const footerTopReserve = MARGIN_BOTTOM + 30 * MM;
  if (p < footerTopReserve) {
    const page2 = doc.addPage([PAGE_W, PAGE_H]);
    page2.drawText("RECHNUNG", {
      x: MARGIN_LEFT,
      y: PAGE_H - MARGIN_TOP - 12 * MM,
      size: 18,
      font: anton,
      color: BRAND_ROSA,
    });
  }

  // 7. Footer (4-column)
  const footerBottomY = MARGIN_BOTTOM;
  const colSpacing = CONTENT_W / 4;
  const iconBoxW = 13 * MM;
  const iconBoxH = 11 * MM;
  const iconBottomY = footerBottomY + 18 * MM;
  const colTextBaseY = footerBottomY + 13 * MM;
  const colTextLineH = 3.8 * MM;

  const colCenters = [
    MARGIN_LEFT + colSpacing * 0.5,
    MARGIN_LEFT + colSpacing * 1.5,
    MARGIN_LEFT + colSpacing * 2.5,
    MARGIN_LEFT + colSpacing * 3.5,
  ];

  const drawFooterCol = (
    centerX: number,
    icon: PDFImage,
    lines: Array<{ text: string; color?: RGB; bold?: boolean }>,
  ): void => {
    drawCenteredImage(page, icon, centerX, iconBottomY, iconBoxW, iconBoxH);
    let y = colTextBaseY;
    for (const line of lines) {
      const font = line.bold ? bold : regular;
      const w = font.widthOfTextAtSize(line.text, SIZE_FOOTER);
      page.drawText(line.text, {
        x: centerX - w / 2,
        y,
        size: SIZE_FOOTER,
        font,
        color: line.color ?? BODY,
      });
      y -= colTextLineH;
    }
  };

  drawFooterCol(colCenters[0]!, iconHouse, [
    { text: `℅ ${input.verein.kontaktPerson}` },
    { text: input.verein.adresseLine1 },
    { text: input.verein.adresseLine2 },
  ]);
  drawFooterCol(colCenters[1]!, iconContact, [
    { text: input.verein.contactPhone },
    { text: input.verein.contactEmail },
    { text: "" },
  ]);
  drawFooterCol(colCenters[2]!, iconBank, [
    { text: input.verein.bankname },
    { text: input.verein.iban },
    { text: `BIC: ${input.verein.bic}` },
  ]);
  drawFooterCol(colCenters[3]!, iconPerson, [
    { text: input.verein.name },
    { text: "Steuernummer:" },
    { text: input.verein.steuernummer, color: BRAND_ROSA },
  ]);

  return doc.save();
}

export { rgb };
