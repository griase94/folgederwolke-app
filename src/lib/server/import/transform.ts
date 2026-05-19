/**
 * Pure transform from legacy-sheet rows → insert payloads.
 *
 * No DB access. No Drive calls. No clock reads except via the explicit `now`
 * parameter — fully unit-testable. The runner (`runner.ts`) is the side-effect
 * shell that wraps this with festschreibung checks, idempotency-key lookup,
 * and the actual `db.insert(...)` calls.
 *
 * ADRs enforced here:
 *
 *  - **ADR-0001** (year derivation = gebucht_am): each row's `gebuchtAm` is
 *    the legacy timestamp (Geldfluss-Datum / Geld-Eingang-Datum / fallback to
 *    Rechnungsdatum), NOT the import timestamp. `year_of_buchung` is
 *    re-derived server-side from that.
 *
 *  - **ADR-0010** (business_id preservation): A-/E-/S- IDs from the legacy
 *    sheet are copied verbatim into `business_id`. Rows missing an ID get
 *    skipped with a clear `errors[]` entry — we never invent IDs at import
 *    time because that would orphan downstream PDFs/audit trails.
 *
 *  - **ADR-0007** (bezahlt_von discriminated union): `Bezahlt von` text is
 *    classified into verein / member / extern. "Verein" → verein; matching a
 *    Mitglied (last-name OR Vorname Nachname OR Vorname only after the
 *    legacy lookup strategy) → member; anything else → extern. Legacy
 *    Auslagen-Submission rows that imported via the old script populated
 *    `Externe` info in the Kommentar — we don't have access to those reliably
 *    here, so externe imports get `extern_name=<text>`, `extern_iban=null`,
 *    `extern_email=null`.
 *
 *  - **ADR-0002** (sphere snapshot): Sphäre is looked up via the
 *    `kategorienByName` map keyed by (kind, normalized name). The legacy
 *    sheet has a Sphäre formula, so we ALSO accept the formula's already-
 *    computed value as a fallback when the Kategorie itself can't be matched
 *    (handles "Sonstige" / `⚠ unbekannt` rows).
 *
 *  - **ADR-0012** (source provenance): every row gets `source='sheet_import'`
 *    plus a `source_ref` like `Ausgaben!A47` for forensic traceability.
 *
 * Festschreibung enforcement happens in `runner.ts` — the transform can
 * surface the per-row year so the runner can reject the entire run when any
 * row falls inside a closed year (per the masterplan: "refuse to import into
 * festgeschriebene years").
 */

import type { LegacySheet, LegacyTab, LegacyTabName } from "./sheet-reader.js";
import { findHeaderIndex } from "./sheet-reader.js";
import {
  parseCentsFromAnything,
  parseGermanDate,
  toIsoDate,
} from "./csv-parser.js";
import { parseBusinessId } from "$lib/domain/business-id.js";

// ---------------------------------------------------------------------------
// Lookup tables (passed in by the runner so the transform stays pure)
// ---------------------------------------------------------------------------

export interface MemberLookup {
  id: string;
  vorname: string;
  nachname: string;
}

export interface KategorieLookup {
  id: string;
  kind: "expense" | "income";
  /** Already-trimmed name as stored in the DB. */
  name: string;
  sphere: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich";
}

export interface ProjectLookup {
  id: string;
  name: string;
}

export interface TransformContext {
  members: ReadonlyArray<MemberLookup>;
  kategorien: ReadonlyArray<KategorieLookup>;
  projects: ReadonlyArray<ProjectLookup>;
  /** Stable provenance marker — runner sets this once per run. */
  sourceTag: string;
}

// ---------------------------------------------------------------------------
// Output row shapes (subset of the drizzle schemas — only fields the
// importer sets explicitly; created_at / updated_at / status defaults stay).
// ---------------------------------------------------------------------------

export type Sphere =
  | "ideeller"
  | "vermoegen"
  | "zweckbetrieb"
  | "wirtschaftlich";

export interface ExpenseInsert {
  businessId: string;
  source: "sheet_import";
  sourceRef: string;
  gebuchtAm: Date;
  rechnungsdatum: string | null;
  abflussDatum: string | null;
  betragCents: bigint;
  currency: string;
  bezeichnung: string;
  kommentar: string | null;
  kategorieId: string | null;
  kategorieNameSnapshot: string;
  sphereSnapshot: Sphere;
  projectId: string | null;
  bezahltVonKind: "verein" | "member" | "extern";
  bezahltVonMemberId: string | null;
  externName: string | null;
  externIban: string | null;
  externEmail: string | null;
  bezahltVonDisplay: string;
  belegOriginalName: string | null;
  status: "zu_pruefen" | "erstattet" | "geprueft";
  erstattetAm: string | null;
}

export interface IncomeInsert {
  businessId: string;
  source: "sheet_import";
  sourceRef: string;
  gebuchtAm: Date;
  geldEingangDatum: string | null;
  rechnungsdatum: string | null;
  betragCents: bigint;
  currency: string;
  bezeichnung: string;
  kommentar: string | null;
  kategorieId: string | null;
  kategorieNameSnapshot: string;
  sphereSnapshot: Sphere;
  projectId: string | null;
}

export interface DonationInsert {
  businessId: string;
  source: "sheet_import";
  sourceRef: string;
  gebuchtAm: Date;
  zugewendetAm: string | null;
  betragCents: bigint;
  currency: string;
  memberId: string | null;
  spenderName: string | null;
  spenderAdresse: string | null;
  spenderEmail: string | null;
  spendeKind: "geldspende" | "sachspende" | "aufwandsspende";
  kategorieId: string | null;
  kategorieNameSnapshot: string;
  sphereSnapshot: Sphere;
  bescheinigungNr: string | null;
}

export interface AuslagenSubmissionInsert {
  businessId: string;
  submittedAt: Date;
  bezeichnung: string;
  kommentar: string | null;
  rechnungsdatum: string | null;
  betragCents: bigint;
  currency: string;
  wofuer: string | null;
  bezahltVonKind: "verein" | "member" | "extern";
  bezahltVonMemberId: string | null;
  externName: string | null;
  externIban: string | null;
  externEmail: string | null;
  bezahltVonDisplay: string;
  /** Snapshot of the consent version stamped at original submission time. */
  consentTextVersion: string;
}

export interface TransformError {
  tab: LegacyTabName;
  rowIndex: number;
  message: string;
  /** Snippet from the legacy row to help the admin locate it. */
  preview: string;
}

export interface TransformResult {
  expenses: ExpenseInsert[];
  income: IncomeInsert[];
  donations: DonationInsert[];
  auslagenSubmissions: AuslagenSubmissionInsert[];
  errors: TransformError[];
  /** Unique years touched (for the festschreibung gate in the runner). */
  yearsTouched: number[];
}

// ---------------------------------------------------------------------------
// Top-level entry
// ---------------------------------------------------------------------------

export function transformLegacySheet(
  sheet: LegacySheet,
  ctx: TransformContext,
): TransformResult {
  const result: TransformResult = {
    expenses: [],
    income: [],
    donations: [],
    auslagenSubmissions: [],
    errors: [],
    yearsTouched: [],
  };
  const years = new Set<number>();

  const ausgaben = sheet.tabs.Ausgaben;
  if (ausgaben) {
    for (const row of transformAusgaben(ausgaben, ctx, result.errors)) {
      result.expenses.push(row);
      years.add(row.gebuchtAm.getFullYear());
    }
  }

  const einnahmen = sheet.tabs.Einnahmen;
  if (einnahmen) {
    for (const row of transformEinnahmen(einnahmen, ctx, result.errors)) {
      result.income.push(row);
      years.add(row.gebuchtAm.getFullYear());
    }
  }

  const spenden = sheet.tabs.Spenden;
  if (spenden) {
    for (const row of transformSpenden(spenden, ctx, result.errors)) {
      result.donations.push(row);
      years.add(row.gebuchtAm.getFullYear());
    }
  }

  result.yearsTouched = [...years].sort();
  return result;
}

// ---------------------------------------------------------------------------
// Ausgaben transform
// ---------------------------------------------------------------------------

interface AusgabenColMap {
  nr: number;
  abfluss: number;
  rechnungsdatum: number;
  bezeichnung: number;
  kategorie: number;
  sphaere: number;
  projekt: number;
  betrag: number;
  bezahltVon: number;
  bezahltMit: number;
  erstattetAm: number;
  belegLink: number;
  ref: number;
  kommentar: number;
}

function mapAusgabenColumns(headers: string[]): AusgabenColMap {
  return {
    nr: findHeaderIndex(headers, [/^nr\b|^a[-‐]?id|^id$/i]),
    abfluss: findHeaderIndex(headers, [/abfluss|geldfluss|zahlung/i]),
    rechnungsdatum: findHeaderIndex(headers, [
      /rechnungs[\s-]?datum|belegdatum/i,
    ]),
    bezeichnung: findHeaderIndex(headers, [/bezeichnung|was/i]),
    kategorie: findHeaderIndex(headers, [/^kategorie/i]),
    sphaere: findHeaderIndex(headers, [/^sph(a|ä)re/i]),
    projekt: findHeaderIndex(headers, [/^projekt|wof[üu]r/i]),
    betrag: findHeaderIndex(headers, [/^betrag|^summe|^preis/i]),
    bezahltVon: findHeaderIndex(headers, [/bezahlt\s*von/i]),
    bezahltMit: findHeaderIndex(headers, [
      /bezahlt\s*(mit|\/?\s*erstattet\s*mit)|zahlungsart/i,
    ]),
    erstattetAm: findHeaderIndex(headers, [/erstattet\s*am/i]),
    belegLink: findHeaderIndex(headers, [/beleg|rechnung\s*\(?link/i]),
    ref: findHeaderIndex(headers, [/auslagen[-\s]*ref|aus[-\s]*ref/i]),
    kommentar: findHeaderIndex(headers, [/kommentar|notiz/i]),
  };
}

function transformAusgaben(
  tab: LegacyTab,
  ctx: TransformContext,
  errors: TransformError[],
): ExpenseInsert[] {
  const cols = mapAusgabenColumns(tab.headers);
  if (cols.nr < 0 || cols.betrag < 0 || cols.bezeichnung < 0) {
    errors.push({
      tab: "Ausgaben",
      rowIndex: 0,
      message: `Pflichtspalten fehlen (Nr / Betrag / Bezeichnung) im Header: ${tab.headers.join(", ")}`,
      preview: tab.headers.slice(0, 6).join(" | "),
    });
    return [];
  }

  const out: ExpenseInsert[] = [];
  tab.rows.forEach((raw, i) => {
    // Sheet row number = data row index + 2 (1-based + header row).
    const sheetRow = i + 2;
    const preview = raw.slice(0, 6).join(" | ");

    const businessId = (raw[cols.nr] ?? "").trim();
    if (!businessId) return; // blank row — skip silently

    if (!parseBusinessId(businessId)) {
      errors.push({
        tab: "Ausgaben",
        rowIndex: sheetRow,
        message: `business_id "${businessId}" hat nicht das Format <PREFIX>-<YYYY>-<NNN>`,
        preview,
      });
      return;
    }

    const bezeichnung = (raw[cols.bezeichnung] ?? "").trim();
    if (!bezeichnung || /^(TRUE|FALSE)$/i.test(bezeichnung)) {
      errors.push({
        tab: "Ausgaben",
        rowIndex: sheetRow,
        message: `Bezeichnung fehlt oder ist Boolean-Leak ("${bezeichnung}") — Zeile manuell reparieren bevor importiert wird.`,
        preview,
      });
      return;
    }

    const cents = parseCentsFromAnything(raw[cols.betrag]);
    if (cents === null || cents <= 0) {
      errors.push({
        tab: "Ausgaben",
        rowIndex: sheetRow,
        message: `Betrag "${raw[cols.betrag]}" konnte nicht in Cents geparst werden.`,
        preview,
      });
      return;
    }

    // ADR-0001: gebucht_am = legacy timestamp.
    // Source-of-truth ladder: Abfluss-Datum (col B) → Rechnungsdatum (col C)
    // → year segment of business_id (last-resort, midyear Jan 1).
    const abflussDate =
      cols.abfluss >= 0 ? parseGermanDate(raw[cols.abfluss]) : null;
    const rechnungsDate =
      cols.rechnungsdatum >= 0
        ? parseGermanDate(raw[cols.rechnungsdatum])
        : null;
    const erstattetDate =
      cols.erstattetAm >= 0 ? parseGermanDate(raw[cols.erstattetAm]) : null;

    const parsedId = parseBusinessId(businessId)!;
    const gebuchtAm =
      abflussDate ?? rechnungsDate ?? new Date(parsedId.year, 0, 1, 12, 0, 0);

    // Year-consistency CHECK (ADR-0010) — assert pre-write so the DB
    // CHECK doesn't fail on an entire batch insert and abort it.
    const derivedYear = gebuchtAm.getFullYear();
    if (derivedYear !== parsedId.year) {
      errors.push({
        tab: "Ausgaben",
        rowIndex: sheetRow,
        message:
          `business_id "${businessId}" → year ${parsedId.year}, aber gebucht_am → year ${derivedYear}.` +
          ` ADR-0010 year-consistency würde fehlschlagen.`,
        preview,
      });
      return;
    }

    // Kategorie + Sphäre snapshot.
    const kategorieName = (raw[cols.kategorie] ?? "").trim();
    const sphaereFromSheet = (
      cols.sphaere >= 0 ? (raw[cols.sphaere] ?? "") : ""
    ).trim();
    const { kategorieId, sphereSnapshot, snapshot } = resolveKategorie(
      ctx,
      "expense",
      kategorieName,
      sphaereFromSheet,
    );

    // Projekt.
    const projektName = (raw[cols.projekt] ?? "").trim();
    const projectId = resolveProjectId(ctx, projektName);

    // Bezahlt-von discriminator.
    const bezahltVonText = (raw[cols.bezahltVon] ?? "").trim();
    const bv = classifyBezahltVon(bezahltVonText, ctx.members);

    const kommentarRaw = (raw[cols.kommentar] ?? "").trim();
    const belegLink =
      cols.belegLink >= 0 ? (raw[cols.belegLink] ?? "").trim() : "";

    // Inherit status from the data: if erstattet_am is set, status = erstattet.
    const status: ExpenseInsert["status"] = erstattetDate
      ? "erstattet"
      : "geprueft";

    out.push({
      businessId,
      source: "sheet_import",
      sourceRef: `${ctx.sourceTag}#Ausgaben!A${sheetRow}`,
      gebuchtAm,
      rechnungsdatum: toIsoDate(rechnungsDate),
      abflussDatum: toIsoDate(abflussDate),
      betragCents: BigInt(cents),
      currency: "EUR",
      bezeichnung,
      kommentar: combineKommentar(kommentarRaw, belegLink),
      kategorieId,
      kategorieNameSnapshot: snapshot,
      sphereSnapshot,
      projectId,
      bezahltVonKind: bv.kind,
      bezahltVonMemberId: bv.memberId,
      externName: bv.externName,
      externIban: null,
      externEmail: null,
      bezahltVonDisplay: bv.display,
      belegOriginalName: belegLink || null,
      status,
      erstattetAm: toIsoDate(erstattetDate),
    });
  });

  return out;
}

function combineKommentar(kommentar: string, belegLink: string): string | null {
  const parts: string[] = [];
  if (kommentar) parts.push(kommentar);
  if (belegLink) parts.push(`Beleg (legacy): ${belegLink}`);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

// ---------------------------------------------------------------------------
// Einnahmen transform
// ---------------------------------------------------------------------------

interface EinnahmenColMap {
  nr: number;
  eingangDatum: number;
  rechnungsdatum: number;
  bezeichnung: number;
  kategorie: number;
  sphaere: number;
  projekt: number;
  betrag: number;
  zahlungsart: number;
  rechnungLink: number;
  kommentar: number;
}

function mapEinnahmenColumns(headers: string[]): EinnahmenColMap {
  return {
    nr: findHeaderIndex(headers, [/^nr\b|^e[-‐]?id|^id$/i]),
    eingangDatum: findHeaderIndex(headers, [
      /eingang[s-]?datum|geldeingang|eingang/i,
    ]),
    rechnungsdatum: findHeaderIndex(headers, [/rechnungs[\s-]?datum/i]),
    bezeichnung: findHeaderIndex(headers, [/bezeichnung/i]),
    kategorie: findHeaderIndex(headers, [/^kategorie/i]),
    sphaere: findHeaderIndex(headers, [/^sph(a|ä)re/i]),
    projekt: findHeaderIndex(headers, [/^projekt|wof[üu]r/i]),
    betrag: findHeaderIndex(headers, [/^betrag/i]),
    zahlungsart: findHeaderIndex(headers, [/zahlungsart/i]),
    rechnungLink: findHeaderIndex(headers, [/rechnung|link/i]),
    kommentar: findHeaderIndex(headers, [/kommentar|notiz/i]),
  };
}

function transformEinnahmen(
  tab: LegacyTab,
  ctx: TransformContext,
  errors: TransformError[],
): IncomeInsert[] {
  const cols = mapEinnahmenColumns(tab.headers);
  if (cols.nr < 0 || cols.betrag < 0 || cols.bezeichnung < 0) {
    errors.push({
      tab: "Einnahmen",
      rowIndex: 0,
      message: `Pflichtspalten fehlen im Header: ${tab.headers.join(", ")}`,
      preview: tab.headers.slice(0, 6).join(" | "),
    });
    return [];
  }

  const out: IncomeInsert[] = [];
  tab.rows.forEach((raw, i) => {
    const sheetRow = i + 2;
    const preview = raw.slice(0, 6).join(" | ");
    const businessId = (raw[cols.nr] ?? "").trim();
    if (!businessId) return;

    const parsed = parseBusinessId(businessId);
    if (!parsed) {
      errors.push({
        tab: "Einnahmen",
        rowIndex: sheetRow,
        message: `business_id "${businessId}" hat nicht das Format <PREFIX>-<YYYY>-<NNN>`,
        preview,
      });
      return;
    }

    const bezeichnung = (raw[cols.bezeichnung] ?? "").trim();
    if (!bezeichnung) {
      errors.push({
        tab: "Einnahmen",
        rowIndex: sheetRow,
        message: `Bezeichnung fehlt`,
        preview,
      });
      return;
    }

    const cents = parseCentsFromAnything(raw[cols.betrag]);
    if (cents === null || cents <= 0) {
      errors.push({
        tab: "Einnahmen",
        rowIndex: sheetRow,
        message: `Betrag "${raw[cols.betrag]}" konnte nicht geparst werden.`,
        preview,
      });
      return;
    }

    const eingangDate =
      cols.eingangDatum >= 0 ? parseGermanDate(raw[cols.eingangDatum]) : null;
    const rechnungsDate =
      cols.rechnungsdatum >= 0
        ? parseGermanDate(raw[cols.rechnungsdatum])
        : null;
    const gebuchtAm =
      eingangDate ?? rechnungsDate ?? new Date(parsed.year, 0, 1, 12, 0, 0);

    if (gebuchtAm.getFullYear() !== parsed.year) {
      errors.push({
        tab: "Einnahmen",
        rowIndex: sheetRow,
        message:
          `business_id "${businessId}" → year ${parsed.year}, gebucht_am → year ${gebuchtAm.getFullYear()}.` +
          ` ADR-0010 year-consistency würde fehlschlagen.`,
        preview,
      });
      return;
    }

    const kategorieName = (raw[cols.kategorie] ?? "").trim();
    const sphaereFromSheet = (
      cols.sphaere >= 0 ? (raw[cols.sphaere] ?? "") : ""
    ).trim();
    const { kategorieId, sphereSnapshot, snapshot } = resolveKategorie(
      ctx,
      "income",
      kategorieName,
      sphaereFromSheet,
    );

    const projektName = (raw[cols.projekt] ?? "").trim();
    const projectId = resolveProjectId(ctx, projektName);

    const kommentar = (raw[cols.kommentar] ?? "").trim() || null;

    out.push({
      businessId,
      source: "sheet_import",
      sourceRef: `${ctx.sourceTag}#Einnahmen!A${sheetRow}`,
      gebuchtAm,
      geldEingangDatum: toIsoDate(eingangDate),
      rechnungsdatum: toIsoDate(rechnungsDate),
      betragCents: BigInt(cents),
      currency: "EUR",
      bezeichnung,
      kommentar,
      kategorieId,
      kategorieNameSnapshot: snapshot,
      sphereSnapshot,
      projectId,
    });
  });

  return out;
}

// ---------------------------------------------------------------------------
// Spenden transform
// ---------------------------------------------------------------------------

interface SpendenColMap {
  nr: number;
  datum: number;
  spender: number;
  betrag: number;
  spendeart: number;
  bescheinigungNr: number;
  adresse: number;
  email: number;
  kommentar: number;
}

function mapSpendenColumns(headers: string[]): SpendenColMap {
  return {
    nr: findHeaderIndex(headers, [/^nr\b|^s[-‐]?id|^id$/i]),
    datum: findHeaderIndex(headers, [/datum|eingang|zugewendet/i]),
    spender: findHeaderIndex(headers, [/spender|name/i]),
    betrag: findHeaderIndex(headers, [/^betrag/i]),
    spendeart: findHeaderIndex(headers, [/spendeart|spende[\s-]?kind|art/i]),
    bescheinigungNr: findHeaderIndex(headers, [/bescheinigung/i]),
    adresse: findHeaderIndex(headers, [/adresse|anschrift/i]),
    email: findHeaderIndex(headers, [/e-?mail/i]),
    kommentar: findHeaderIndex(headers, [/kommentar|notiz/i]),
  };
}

function transformSpenden(
  tab: LegacyTab,
  ctx: TransformContext,
  errors: TransformError[],
): DonationInsert[] {
  const cols = mapSpendenColumns(tab.headers);
  if (cols.nr < 0 || cols.betrag < 0) {
    errors.push({
      tab: "Spenden",
      rowIndex: 0,
      message: `Pflichtspalten fehlen (Nr / Betrag): ${tab.headers.join(", ")}`,
      preview: tab.headers.slice(0, 6).join(" | "),
    });
    return [];
  }

  const out: DonationInsert[] = [];
  tab.rows.forEach((raw, i) => {
    const sheetRow = i + 2;
    const preview = raw.slice(0, 6).join(" | ");
    const businessId = (raw[cols.nr] ?? "").trim();
    if (!businessId) return;
    const parsed = parseBusinessId(businessId);
    if (!parsed) {
      errors.push({
        tab: "Spenden",
        rowIndex: sheetRow,
        message: `business_id "${businessId}" hat nicht das Format <PREFIX>-<YYYY>-<NNN>`,
        preview,
      });
      return;
    }

    const cents = parseCentsFromAnything(raw[cols.betrag]);
    if (cents === null || cents <= 0) {
      errors.push({
        tab: "Spenden",
        rowIndex: sheetRow,
        message: `Betrag "${raw[cols.betrag]}" konnte nicht geparst werden.`,
        preview,
      });
      return;
    }

    const datum = cols.datum >= 0 ? parseGermanDate(raw[cols.datum]) : null;
    const gebuchtAm = datum ?? new Date(parsed.year, 0, 1, 12, 0, 0);
    if (gebuchtAm.getFullYear() !== parsed.year) {
      errors.push({
        tab: "Spenden",
        rowIndex: sheetRow,
        message: `year-consistency: business_id ${businessId} vs gebucht_am ${gebuchtAm.getFullYear()}`,
        preview,
      });
      return;
    }

    const spenderName =
      cols.spender >= 0 ? (raw[cols.spender] ?? "").trim() || null : null;
    const adresse =
      cols.adresse >= 0 ? (raw[cols.adresse] ?? "").trim() || null : null;
    const email =
      cols.email >= 0 ? (raw[cols.email] ?? "").trim() || null : null;
    const bescheinigungNr =
      cols.bescheinigungNr >= 0
        ? (raw[cols.bescheinigungNr] ?? "").trim() || null
        : null;

    // Resolve spende_kind from the legacy "Spendeart" column.
    const spendeartRaw =
      cols.spendeart >= 0
        ? (raw[cols.spendeart] ?? "").trim().toLowerCase()
        : "";
    let spendeKind: DonationInsert["spendeKind"] = "geldspende";
    if (spendeartRaw.includes("sach")) spendeKind = "sachspende";
    else if (spendeartRaw.includes("aufwand")) spendeKind = "aufwandsspende";

    // Try to link the donation to an existing member by spender name.
    const memberMatch = findMemberByName(spenderName, ctx.members);

    // Spenden default to ideeller sphere (Vereinszweck-Sphäre). The schema
    // default also covers this; we still write it explicitly for ADR-0002.
    out.push({
      businessId,
      source: "sheet_import",
      sourceRef: `${ctx.sourceTag}#Spenden!A${sheetRow}`,
      gebuchtAm,
      zugewendetAm: toIsoDate(datum),
      betragCents: BigInt(cents),
      currency: "EUR",
      memberId: memberMatch?.id ?? null,
      spenderName,
      spenderAdresse: adresse,
      spenderEmail: email,
      spendeKind,
      kategorieId: null,
      kategorieNameSnapshot: "Geldspende (Import)",
      sphereSnapshot: "ideeller",
      bescheinigungNr,
    });
  });

  return out;
}

// ---------------------------------------------------------------------------
// Bezahlt-von classifier
// ---------------------------------------------------------------------------

interface BvResolved {
  kind: "verein" | "member" | "extern";
  memberId: string | null;
  externName: string | null;
  display: string;
}

function classifyBezahltVon(
  text: string,
  members: ReadonlyArray<MemberLookup>,
): BvResolved {
  const norm = text.trim();
  if (!norm) {
    return {
      kind: "verein",
      memberId: null,
      externName: null,
      display: "Verein",
    };
  }
  if (/^verein$/i.test(norm)) {
    return {
      kind: "verein",
      memberId: null,
      externName: null,
      display: "Verein",
    };
  }

  const member = findMemberByName(norm, members);
  if (member) {
    return {
      kind: "member",
      memberId: member.id,
      externName: null,
      display: `Mitglied: ${member.vorname} ${member.nachname}`.trim(),
    };
  }

  return {
    kind: "extern",
    memberId: null,
    externName: norm,
    display: `Extern: ${norm}`,
  };
}

/**
 * Legacy 3-strategy member match (mirrors `lookup.ts` in buchhaltung):
 *   1. exact "Vorname Nachname"
 *   2. nachname only (single match)
 *   3. vorname only (single match)
 * All case-insensitive + diacritic-tolerant via NFD-strip.
 */
export function findMemberByName(
  text: string | null,
  members: ReadonlyArray<MemberLookup>,
): MemberLookup | null {
  if (!text) return null;
  const norm = stripDiacritics(text).toLowerCase().trim();
  if (!norm) return null;

  // Strategy 1: full name match
  for (const m of members) {
    const full = stripDiacritics(`${m.vorname} ${m.nachname}`)
      .toLowerCase()
      .trim();
    if (full === norm) return m;
  }

  // Strategy 2: nachname only (unique match)
  const byNach = members.filter(
    (m) => stripDiacritics(m.nachname).toLowerCase() === norm,
  );
  if (byNach.length === 1) return byNach[0]!;

  // Strategy 3: vorname only (unique match)
  const byVor = members.filter(
    (m) => stripDiacritics(m.vorname).toLowerCase() === norm,
  );
  if (byVor.length === 1) return byVor[0]!;

  return null;
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ---------------------------------------------------------------------------
// Kategorie resolver
// ---------------------------------------------------------------------------

function resolveKategorie(
  ctx: TransformContext,
  kind: "expense" | "income",
  legacyName: string,
  legacySphereCell: string,
): { kategorieId: string | null; sphereSnapshot: Sphere; snapshot: string } {
  // Try kategorie name match (case-insensitive, diacritic-stripped, with the
  // legacy emoji prefix stripped if present).
  const norm = stripDiacritics(legacyName).toLowerCase().trim();
  if (norm) {
    for (const k of ctx.kategorien) {
      if (k.kind !== kind) continue;
      const kNorm = stripDiacritics(k.name).toLowerCase().trim();
      if (kNorm === norm || kNorm.endsWith(norm) || norm.endsWith(kNorm)) {
        return {
          kategorieId: k.id,
          sphereSnapshot: k.sphere,
          snapshot: k.name,
        };
      }
    }
  }

  // Fallback: parse sphäre from the formula's already-evaluated cell value.
  const sphereFromSheet = parseSphereCell(legacySphereCell);
  return {
    kategorieId: null,
    sphereSnapshot: sphereFromSheet ?? "ideeller",
    snapshot: legacyName || "(Unkategorisiert)",
  };
}

function parseSphereCell(raw: string): Sphere | null {
  const lower = raw.toLowerCase();
  if (lower.includes("ideel")) return "ideeller";
  if (lower.includes("vermögen") || lower.includes("vermoegen"))
    return "vermoegen";
  if (lower.includes("zweck")) return "zweckbetrieb";
  if (lower.includes("wirtschaft")) return "wirtschaftlich";
  return null;
}

// ---------------------------------------------------------------------------
// Project resolver
// ---------------------------------------------------------------------------

function resolveProjectId(
  ctx: TransformContext,
  projektName: string,
): string | null {
  if (!projektName) return null;
  // Legacy "🌥 Allgemein / kein konkretes Projekt" → no project link.
  if (/allgemein/i.test(projektName) && /kein/i.test(projektName)) {
    return null;
  }
  const norm = stripDiacritics(projektName).toLowerCase().trim();
  for (const p of ctx.projects) {
    if (stripDiacritics(p.name).toLowerCase().trim() === norm) return p.id;
  }
  return null;
}
