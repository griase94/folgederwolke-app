/**
 * Auskunft PDF renderer — DSGVO Art. 15 data subject access request.
 *
 * Renders a structured A4 PDF with one section per table, listing all
 * rows referencing the requested email address.
 *
 * Uses the same pdf-lib + DrawCtx pattern as bescheinigung-template.ts.
 */

import { PDFDocument, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { AuskunftData } from "$lib/server/domain/dsgvo.js";

// ── Geometry ──────────────────────────────────────────────────────────────────
const MM_TO_PT = 72 / 25.4;
const mm = (n: number): number => n * MM_TO_PT;

const PAGE_W = mm(210);
const PAGE_H = mm(297);
const MARGIN_X = mm(20);
const MARGIN_TOP = mm(20);
const MARGIN_BOTTOM = mm(15);
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

// ── Palette ───────────────────────────────────────────────────────────────────
const COLOR_PRIMARY: RGB = rgb(0.55, 0.16, 0.4);
const COLOR_TEXT: RGB = rgb(0.1, 0.1, 0.14);
const COLOR_MUTED: RGB = rgb(0.42, 0.42, 0.5);
const COLOR_RULE: RGB = rgb(0.85, 0.78, 0.82);
const COLOR_SECTION_BG: RGB = rgb(0.97, 0.95, 0.97);

const SIZE_TITLE = 16;
const SIZE_SECTION = 11;
const SIZE_BODY = 9;
const SIZE_SMALL = 8;
const SIZE_FOOTER = 7.5;

// ── Types ─────────────────────────────────────────────────────────────────────

import type { PDFFont, PDFPage } from "pdf-lib";

interface DrawCtx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (font.widthOfTextAtSize(raw, size) <= maxWidth) {
      out.push(raw);
      continue;
    }
    const words = raw.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function ensureSpace(ctx: DrawCtx, needed: number): void {
  if (ctx.y - needed < MARGIN_BOTTOM + mm(5)) {
    addPage(ctx);
  }
}

function addPage(ctx: DrawCtx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN_TOP;
}

function drawText(
  ctx: DrawCtx,
  text: string,
  opts: {
    x?: number;
    size?: number;
    bold?: boolean;
    color?: RGB;
    maxWidth?: number;
    lineGap?: number;
  } = {},
): void {
  const size = opts.size ?? SIZE_BODY;
  const x = opts.x ?? MARGIN_X;
  const font = opts.bold ? ctx.fontBold : ctx.font;
  const color = opts.color ?? COLOR_TEXT;
  const lineGap = opts.lineGap ?? 1.4;
  const lineH = size * lineGap;
  const maxW = opts.maxWidth ?? CONTENT_W;
  const lines = wrapText(text, font, size, maxW);

  for (const line of lines) {
    ensureSpace(ctx, lineH + 2);
    ctx.page.drawText(line, { x, y: ctx.y - size, size, font, color });
    ctx.y -= lineH;
  }
}

function drawRule(ctx: DrawCtx, opts: { color?: RGB } = {}): void {
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_W - MARGIN_X, y: ctx.y },
    thickness: 0.4,
    color: opts.color ?? COLOR_RULE,
  });
  ctx.y -= mm(2);
}

function drawGap(ctx: DrawCtx, pts: number): void {
  ctx.y -= pts;
}

function drawSectionHeader(ctx: DrawCtx, title: string, count: number): void {
  ensureSpace(ctx, mm(12));
  drawGap(ctx, mm(3));

  // Section background bar
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - mm(7),
    width: CONTENT_W,
    height: mm(7),
    color: COLOR_SECTION_BG,
    borderColor: COLOR_RULE,
    borderWidth: 0.3,
  });

  ctx.page.drawText(`${title} (${count})`, {
    x: MARGIN_X + mm(3),
    y: ctx.y - SIZE_SECTION - mm(0.5),
    size: SIZE_SECTION,
    font: ctx.fontBold,
    color: COLOR_PRIMARY,
  });
  ctx.y -= mm(7);
  drawGap(ctx, mm(2));
}

function drawKvRow(ctx: DrawCtx, key: string, value: string | null): void {
  if (value === null || value === undefined) return;
  const keyW = mm(45);
  const valX = MARGIN_X + keyW;
  const valW = CONTENT_W - keyW;

  ensureSpace(ctx, SIZE_BODY * 1.5 + 2);
  ctx.page.drawText(key, {
    x: MARGIN_X,
    y: ctx.y - SIZE_BODY,
    size: SIZE_SMALL,
    font: ctx.fontBold,
    color: COLOR_MUTED,
  });

  const lines = wrapText(String(value), ctx.font, SIZE_BODY, valW);
  for (let i = 0; i < lines.length; i++) {
    ctx.page.drawText(lines[i]!, {
      x: valX,
      y: ctx.y - SIZE_BODY - i * SIZE_BODY * 1.3,
      size: SIZE_BODY,
      font: ctx.font,
      color: COLOR_TEXT,
    });
  }
  ctx.y -= Math.max(1, lines.length) * SIZE_BODY * 1.4;
}

function drawRowSeparator(ctx: DrawCtx): void {
  ctx.page.drawLine({
    start: { x: MARGIN_X + mm(2), y: ctx.y },
    end: { x: PAGE_W - MARGIN_X - mm(2), y: ctx.y },
    thickness: 0.2,
    color: rgb(0.9, 0.9, 0.92),
  });
  ctx.y -= mm(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderMembers(ctx: DrawCtx, rows: unknown[]): void {
  drawSectionHeader(ctx, "Mitglieder", rows.length);
  if (rows.length === 0) {
    drawText(ctx, "Keine Einträge gefunden.", {
      color: COLOR_MUTED,
      size: SIZE_SMALL,
    });
    return;
  }
  for (const r of rows as Record<string, unknown>[]) {
    drawKvRow(ctx, "ID", String(r["id"] ?? ""));
    drawKvRow(
      ctx,
      "Name",
      `${r["vorname"] ?? ""} ${r["nachname"] ?? ""}`.trim(),
    );
    drawKvRow(ctx, "E-Mail", String(r["email"] ?? ""));
    drawKvRow(ctx, "IBAN", r["iban"] ? String(r["iban"]) : null);
    drawKvRow(ctx, "Telefon", r["telefon"] ? String(r["telefon"]) : null);
    drawKvRow(ctx, "Adresse", r["adresse"] ? String(r["adresse"]) : null);
    drawKvRow(
      ctx,
      "Geburtsdatum",
      r["dateOfBirth"] ? String(r["dateOfBirth"]) : null,
    );
    drawKvRow(ctx, "Rolle", String(r["role"] ?? ""));
    drawKvRow(
      ctx,
      "Eintrittsdatum",
      r["eintrittsDatum"] ? String(r["eintrittsDatum"]) : null,
    );
    drawKvRow(
      ctx,
      "Austrittsdatum",
      r["austrittsDatum"] ? String(r["austrittsDatum"]) : null,
    );
    drawKvRow(ctx, "Erstellt", String(r["createdAt"] ?? ""));
    drawRowSeparator(ctx);
  }
}

function renderDonations(ctx: DrawCtx, rows: unknown[]): void {
  drawSectionHeader(ctx, "Spenden", rows.length);
  if (rows.length === 0) {
    drawText(ctx, "Keine Einträge gefunden.", {
      color: COLOR_MUTED,
      size: SIZE_SMALL,
    });
    return;
  }
  for (const r of rows as Record<string, unknown>[]) {
    drawKvRow(ctx, "ID", String(r["id"] ?? ""));
    drawKvRow(ctx, "Business-ID", String(r["businessId"] ?? ""));
    drawKvRow(ctx, "Gebucht am", String(r["gebuchtAm"] ?? ""));
    drawKvRow(
      ctx,
      "Betrag",
      r["betragCents"] != null
        ? `${(Number(r["betragCents"]) / 100).toFixed(2)} EUR`
        : null,
    );
    drawKvRow(ctx, "Spender Name", r["spenderName"] as string | null);
    drawKvRow(ctx, "Spender Adresse", r["spenderAdresse"] as string | null);
    drawKvRow(ctx, "Spender E-Mail", r["spenderEmail"] as string | null);
    drawKvRow(ctx, "Art", String(r["spendeKind"] ?? ""));
    drawKvRow(ctx, "Bescheinigungs-Nr", r["bescheinigungNr"] as string | null);
    drawRowSeparator(ctx);
  }
}

function renderAuslagen(ctx: DrawCtx, rows: unknown[]): void {
  drawSectionHeader(ctx, "Auslagen-Einreichungen", rows.length);
  if (rows.length === 0) {
    drawText(ctx, "Keine Einträge gefunden.", {
      color: COLOR_MUTED,
      size: SIZE_SMALL,
    });
    return;
  }
  for (const r of rows as Record<string, unknown>[]) {
    drawKvRow(ctx, "ID", String(r["id"] ?? ""));
    drawKvRow(ctx, "Business-ID", String(r["businessId"] ?? ""));
    drawKvRow(ctx, "Eingereicht am", String(r["submittedAt"] ?? ""));
    drawKvRow(ctx, "Bezeichnung", String(r["bezeichnung"] ?? ""));
    drawKvRow(
      ctx,
      "Betrag",
      r["betragCents"] != null
        ? `${(Number(r["betragCents"]) / 100).toFixed(2)} EUR`
        : null,
    );
    drawKvRow(ctx, "Zahler Art", String(r["bezahltVonKind"] ?? ""));
    drawKvRow(ctx, "Extern Name", r["externName"] as string | null);
    drawKvRow(ctx, "Extern E-Mail", r["externEmail"] as string | null);
    drawRowSeparator(ctx);
  }
}

function renderSentMails(ctx: DrawCtx, rows: unknown[]): void {
  drawSectionHeader(ctx, "Gesendete E-Mails", rows.length);
  if (rows.length === 0) {
    drawText(ctx, "Keine Einträge gefunden.", {
      color: COLOR_MUTED,
      size: SIZE_SMALL,
    });
    return;
  }
  for (const r of rows as Record<string, unknown>[]) {
    drawKvRow(ctx, "ID", String(r["id"] ?? ""));
    drawKvRow(ctx, "Template", String(r["template"] ?? ""));
    drawKvRow(ctx, "Empfänger", String(r["toDisplay"] ?? ""));
    drawKvRow(ctx, "Betreff", String(r["subject"] ?? ""));
    drawKvRow(ctx, "Status", String(r["status"] ?? ""));
    drawKvRow(ctx, "Gesendet am", String(r["queuedAt"] ?? ""));
    drawRowSeparator(ctx);
  }
}

function renderAuditLog(ctx: DrawCtx, rows: unknown[]): void {
  drawSectionHeader(ctx, "Audit-Log Einträge", rows.length);
  if (rows.length === 0) {
    drawText(ctx, "Keine Einträge gefunden.", {
      color: COLOR_MUTED,
      size: SIZE_SMALL,
    });
    return;
  }
  for (const r of rows as Record<string, unknown>[]) {
    drawKvRow(ctx, "ID", String(r["id"] ?? ""));
    drawKvRow(ctx, "Zeitpunkt", String(r["occurredAt"] ?? ""));
    drawKvRow(ctx, "Aktion", String(r["action"] ?? ""));
    drawKvRow(ctx, "Entität", String(r["entityKind"] ?? ""));
    drawKvRow(ctx, "Entität-ID", r["entityId"] as string | null);
    drawRowSeparator(ctx);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface AuskunftRenderOutput {
  bytes: Uint8Array;
  suggestedFilename: string;
  mimeType: "application/pdf";
}

export async function renderAuskunftPdf(
  data: AuskunftData,
): Promise<AuskunftRenderOutput> {
  const doc = await PDFDocument.create();
  doc.setTitle(`DSGVO Auskunft — ${data.email}`);
  doc.setSubject("Datenschutz-Auskunft gemäß Art. 15 DSGVO");
  doc.setAuthor("Folge der Wolke e.V.");
  doc.setProducer("folgederwolke-app");
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const firstPage = doc.addPage([PAGE_W, PAGE_H]);

  const ctx: DrawCtx = {
    doc,
    page: firstPage,
    font,
    fontBold,
    y: PAGE_H - MARGIN_TOP,
  };

  // ── Cover header ───────────────────────────────────────────────────────────
  drawText(ctx, "Folge der Wolke e.V.", {
    size: SIZE_SECTION,
    bold: true,
    color: COLOR_PRIMARY,
  });
  drawText(ctx, "Datenschutz-Auskunft gemäß Art. 15 DSGVO", {
    size: SIZE_TITLE,
    bold: true,
    color: COLOR_PRIMARY,
  });
  drawGap(ctx, mm(3));
  drawRule(ctx);

  drawKvRow(ctx, "Anfrage für E-Mail", data.email);
  drawKvRow(
    ctx,
    "Auskunft erstellt",
    new Date(data.collectedAt).toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
    }),
  );
  drawGap(ctx, mm(2));
  drawRule(ctx);

  drawText(
    ctx,
    "Dieses Dokument enthält alle gespeicherten personenbezogenen Daten der " +
      "angegebenen E-Mail-Adresse in unseren Systemen, gemäß Ihrer Anfrage " +
      "nach Art. 15 DSGVO.",
    { size: SIZE_SMALL, color: COLOR_MUTED, lineGap: 1.5 },
  );
  drawGap(ctx, mm(4));

  // ── Sections ──────────────────────────────────────────────────────────────
  renderMembers(ctx, data.members);
  renderDonations(ctx, data.donations);
  renderAuslagen(ctx, data.auslagenSubmissions);
  renderSentMails(ctx, data.sentMails);
  renderAuditLog(ctx, data.auditLogEntries);

  // ── Footer on last page ───────────────────────────────────────────────────
  drawGap(ctx, mm(6));
  drawRule(ctx);
  drawText(
    ctx,
    `Dokument generiert: ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} — vertraulich`,
    { size: SIZE_FOOTER, color: COLOR_MUTED },
  );

  const bytes = await doc.save();
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeEmail = data.email.replace(/[^a-zA-Z0-9@._-]/g, "_");

  return {
    bytes,
    suggestedFilename: `DSGVO_Auskunft_${safeEmail}_${dateStr}.pdf`,
    mimeType: "application/pdf",
  };
}
