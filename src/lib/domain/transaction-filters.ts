// src/lib/domain/transaction-filters.ts
export type TabKey = "ausgaben" | "einnahmen" | "spenden";
export type FilterType =
  | "enum-multi"
  | "member-picker"
  | "date-range"
  | "amount-range"
  | "boolean";

export interface FilterFieldDef {
  key: string;
  label: string;
  type: FilterType;
  /** For enum-multi: the allowed option values (DB enum values). */
  options?: { value: string; label: string }[];
}

const STATUS_OPTIONS = [
  { value: "offen", label: "Offen" }, // maps to zu_pruefen + in_pruefung at the SQL layer
  { value: "geprueft", label: "Genehmigt" },
  { value: "erstattet", label: "Erstattet" },
  { value: "abgelehnt", label: "Abgelehnt" },
  { value: "importiert", label: "Importiert" }, // legacy sheet-import rows; without this they'd be unfilterable
];
const BEZAHLT_VON_OPTIONS = [
  { value: "verein", label: "Verein" },
  { value: "member", label: "Mitglied" },
  { value: "extern", label: "Extern" },
];
const SPHAERE_OPTIONS = [
  { value: "ideeller", label: "Ideeller" },
  { value: "vermoegen", label: "Vermögen" },
  { value: "zweckbetrieb", label: "Zweckbetrieb" },
  { value: "wirtschaftlich", label: "Wirtschaftlich" },
];
const SPENDENART_OPTIONS = [
  { value: "geldspende", label: "Geldspende" },
  { value: "sachspende", label: "Sachspende" },
];
const ZWECKBINDUNG_OPTIONS = [
  { value: "zweckfrei", label: "Zweckfrei" },
  { value: "zweckgebunden", label: "Zweckgebunden" },
];
const BESCHEINIGUNG_OPTIONS = [
  // P2-03: value is German ("versandt") for consistency; the Task 4 buildSpendenWhere
  // branches key on "versandt"/"ausstehend". Both selected => no filter predicate.
  { value: "versandt", label: "Versandt" },
  { value: "ausstehend", label: "Ausstehend" },
];

// Kategorie options (ausgaben/einnahmen) are loaded at runtime via
// `listKategorieOptions(kind)` and injected into the field's `options`; the
// registry leaves `options` undefined for these runtime-loaded fields.
//
// SHARED CONTRACT (P2-04): `listKategorieOptions(kind)` MUST return
// `{ value: kategorieNameSnapshot, label }` — the option `value` is the
// kategorie **name-snapshot string**, NOT the kategorie id. This matches the
// `kategorieNameSnapshot` column the Task 4 WHERE builders feed to
// `inArray(kategorieNameSnapshot, …)`, so the loader and the predicate agree.
export const FILTER_REGISTRY: Record<TabKey, FilterFieldDef[]> = {
  ausgaben: [
    {
      key: "status",
      label: "Status",
      type: "enum-multi",
      options: STATUS_OPTIONS,
    },
    {
      key: "bezahltVon",
      label: "Bezahlt von",
      type: "enum-multi",
      options: BEZAHLT_VON_OPTIONS,
    },
    { key: "kategorie", label: "Kategorie", type: "enum-multi" },
    {
      key: "monat",
      label: "Monat",
      type: "enum-multi",
      options: monthOptions(),
    },
    { key: "betrag", label: "Betrag", type: "amount-range" },
    { key: "belegFehlt", label: "Beleg fehlt", type: "boolean" },
  ],
  einnahmen: [
    { key: "kategorie", label: "Kategorie", type: "enum-multi" },
    {
      key: "sphaere",
      label: "Sphäre",
      type: "enum-multi",
      options: SPHAERE_OPTIONS,
    },
    { key: "mitRechnung", label: "Nur mit Rechnung", type: "boolean" },
    {
      key: "monat",
      label: "Monat",
      type: "enum-multi",
      options: monthOptions(),
    },
    { key: "betrag", label: "Betrag", type: "amount-range" },
  ],
  spenden: [
    {
      key: "spendenart",
      label: "Spendenart",
      type: "enum-multi",
      options: SPENDENART_OPTIONS,
    },
    {
      key: "zweckbindung",
      label: "Zweckbindung",
      type: "enum-multi",
      options: ZWECKBINDUNG_OPTIONS,
    },
    {
      key: "bescheinigung",
      label: "Bescheinigung",
      type: "enum-multi",
      options: BESCHEINIGUNG_OPTIONS,
    },
    { key: "spender", label: "Spender", type: "member-picker" },
    {
      key: "monat",
      label: "Monat",
      type: "enum-multi",
      options: monthOptions(),
    },
    { key: "betrag", label: "Betrag", type: "amount-range" },
  ],
};

function monthOptions() {
  const names = [
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
  ];
  return names.map((label, i) => ({ value: String(i + 1), label }));
}
