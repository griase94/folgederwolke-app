// src/lib/domain/transaction-filters.ts
import { z } from "zod";

export type TabKey = "ausgaben" | "einnahmen" | "spenden" | "transaktionen";
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
  // Aurora slice 5 — the unified /app/transaktionen feed. ONE filter field:
  // the type chips (Alle/Ausgaben/Einnahmen/Spenden) write ?typ=. Search (?q=)
  // is handled generically by parseFilterState. The per-type WHERE builders
  // ignore the "typ" key — listTransaktionenFeedPage reads it to decide which
  // UNION-ALL arms to include.
  transaktionen: [
    {
      key: "typ",
      label: "Typ",
      type: "enum-multi",
      options: [
        { value: "ausgaben", label: "Ausgaben" },
        { value: "einnahmen", label: "Einnahmen" },
        { value: "spenden", label: "Spenden" },
      ],
    },
  ],
};

export interface FilterState {
  search?: string;
  enums: Record<string, string[]>; // key -> selected enum values (incl. monat, kategorie, status, …)
  members: Record<string, string>; // member-picker key -> member id (uuid)
  amount: { betragMin?: number; betragMax?: number };
  booleans: Record<string, boolean>; // e.g. belegFehlt, mitRechnung
}

export function parseFilterState(
  tab: TabKey,
  params: URLSearchParams,
): FilterState {
  const fields = FILTER_REGISTRY[tab];
  const state: FilterState = {
    enums: {},
    members: {},
    amount: {},
    booleans: {},
  };
  const search = params.get("q") ?? undefined;
  if (search && search.trim()) state.search = search.trim().slice(0, 200);

  for (const f of fields) {
    const raw = params.get(f.key);
    if (f.type === "enum-multi") {
      const allowed = f.options ? new Set(f.options.map((o) => o.value)) : null; // null = runtime-loaded (kategorie); accept any non-empty token
      const vals = (raw ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .filter((v) => (allowed ? allowed.has(v) : v.length <= 64));
      if (vals.length) state.enums[f.key] = vals;
    } else if (f.type === "boolean") {
      if (raw === "true") state.booleans[f.key] = true;
    } else if (f.type === "member-picker") {
      const id = params.get(f.key);
      if (id && z.uuid().safeParse(id).success) state.members[f.key] = id;
    } else if (f.type === "amount-range") {
      // P2-01: betragMin/betragMax are FIXED URL param names for the registry field key="betrag".
      // The registry guarantees ≤1 amount-range field per tab, so these names never collide.
      const min = z.coerce
        .number()
        .int()
        .nonnegative()
        .safeParse(params.get("betragMin"));
      const max = z.coerce
        .number()
        .int()
        .nonnegative()
        .safeParse(params.get("betragMax"));
      if (min.success && params.get("betragMin") !== null)
        state.amount.betragMin = min.data;
      if (max.success && params.get("betragMax") !== null)
        state.amount.betragMax = max.data;
    }
  }
  return state;
}

export function serializeFilterState(tab: TabKey, state: FilterState): string {
  const p = new URLSearchParams();
  if (state.search) p.set("q", state.search);
  for (const [k, vals] of Object.entries(state.enums))
    if (vals.length) p.set(k, vals.join(","));
  for (const [k, id] of Object.entries(state.members)) if (id) p.set(k, id);
  for (const [k, on] of Object.entries(state.booleans))
    if (on) p.set(k, "true");
  if (state.amount.betragMin != null)
    p.set("betragMin", String(state.amount.betragMin));
  if (state.amount.betragMax != null)
    p.set("betragMax", String(state.amount.betragMax));
  return p.toString();
}

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
