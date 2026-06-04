# Transactions Phase 2 — Filter Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]`. Read the ROADMAP + spec (§5 filtering, §6 year scope) first. **Depends on Phase 1** being merged — specifically: the `test:fast` no-reset lane (Phase 1 Task 2), the `expenses.beleg_verzicht_grund` column used by the `belegFehlt` builder (Phase 1 Task 1), the NOT-NULL `kategorie_id` + `kategorieSphere`/derivation. Every `pnpm test:fast …` command below is dead until Phase 1 lands; the ROADMAP enforces phase order. Branch: `feat/transactions-three-tabs-v2` (on current origin/main).

**Goal:** Build the typed, composable, **server-side** filter engine + saved-views store + a shared chip filter-bar component, shared by the three transaction list tabs — replacing today's client-side fetch-all-then-`.slice()` filtering and the client-side `SavedViewsBar`/`TypeTabsHeader` prototype.

**Architecture:** A per-tab **filter registry** (typed field declarations) drives three layers that all read from it: (1) a **URL ⇄ filter-state** serializer/parser with Zod-v4 validation; (2) **server-side SQL `WHERE` builders** + per-tab paginated query functions (real `LIMIT`/`OFFSET`/count); (3) a presentational **chip filter-bar** component (desktop chips + mobile sheet + count badge). Saved views (built-in presets + custom localStorage, with rename/delete) serialize to the same filter-state object. The three tab **routes** that consume all this land in Phases 3–6; Phase 2 ships the engine + component, each independently tested.

**Tech Stack:** SvelteKit, Drizzle (postgres-js), Zod v4 (`^4.4.3`), Vitest (fast lane for pure tests; reset lane for DB), `@testing-library/svelte` for the component.

**Testing approach (per ROADMAP):** pure-logic tests (registry, parse/serialize, predicate→SQL fragment, year derivation) → `pnpm test:fast --run <file>` (no DB). DB query-function tests → `pnpm test --run <file>` (one reset). Component test → `pnpm test --run <file>`. Cheapest-first; broad runs only at the Task 9 boundary.

**Key facts from the codebase (verified):**

- `listTransactions` (`src/lib/server/domain/transactions.ts`) fetches all three tables in full, concatenates, sorts in JS, then `allRows.slice(offset, offset+limit)` — no SQL `LIMIT`. This is the bug we fix.
- Layout already provides `selectedYear`/`availableYears`/`currentYear`/`festgeschriebenBis` (`/app/+layout.server.ts`); `selectYearFromUrl`/`clampYearToAvailable`/`currentBuchungsjahr` live in `src/lib/domain/year.ts`. **"Alle Jahre" and the stale-year banner do not exist yet.**
- Enums: `statusEnum` (offen→`zu_pruefen`/`in_pruefung`, genehmigt→`geprueft`, `erstattet`, `abgelehnt`), `bezahltVonKindEnum` (verein/member/extern), `sphereEnum`, `spendeKindEnum`, `zweckbindungKindEnum`. Bescheinigung-Status = `donations.bescheinigungNr IS NULL` / `NOT NULL`.
- **"nur mit Rechnung" (Einnahmen) has no income column** — implement as `EXISTS (SELECT 1 FROM invoices WHERE invoices.paid_by_income_id = income.id)`.
- No shared searchParams-Zod helper, no pagination util, no sort handling, **no member-option loader** (members loaded inline today) — all net-new here.
- Replace prototype: `SavedViewsBar.svelte` (localStorage key `fdw:transaction-views`, uses `new Date().getFullYear()` → ADR-0001 violation, no rename/delete), client-side `TransactionsList.svelte` filtering, `TypeTabsHeader.svelte`.

---

### Task 1: Filter-state types + per-tab registry (pure) `[model: opus]`

Opus: this defines the contracts every later phase consumes — get the shape right.

**Files:** Create `src/lib/domain/transaction-filters.ts`; Test `tests/unit/transaction-filters-registry.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/transaction-filters-registry.test.ts
import { describe, it, expect } from "vitest";
import {
  FILTER_REGISTRY,
  type TabKey,
} from "$lib/domain/transaction-filters.js";

describe("filter registry", () => {
  it("declares fields per tab with a typed shape", () => {
    for (const tab of ["ausgaben", "einnahmen", "spenden"] as TabKey[]) {
      const fields = FILTER_REGISTRY[tab];
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        expect(typeof f.key).toBe("string");
        expect(typeof f.label).toBe("string");
        expect([
          "enum-multi",
          "member-picker",
          "date-range",
          "amount-range",
          "boolean",
        ]).toContain(f.type);
      }
    }
  });
  it("ausgaben has status + bezahltVon; einnahmen has mitRechnung; spenden has spendenart + bescheinigung", () => {
    const keys = (t: TabKey) => FILTER_REGISTRY[t].map((f) => f.key);
    expect(keys("ausgaben")).toEqual(
      expect.arrayContaining([
        "status",
        "bezahltVon",
        "kategorie",
        "monat",
        "betrag",
        "belegFehlt",
      ]),
    );
    expect(keys("einnahmen")).toEqual(
      expect.arrayContaining([
        "kategorie",
        "sphaere",
        "mitRechnung",
        "monat",
        "betrag",
      ]),
    );
    expect(keys("spenden")).toEqual(
      expect.arrayContaining([
        "spendenart",
        "zweckbindung",
        "bescheinigung",
        "spender",
        "monat",
        "betrag",
      ]),
    );
  });
});
```

- [ ] **Step 2: Run via fast lane → fails.**

Run: `pnpm test:fast --run tests/unit/transaction-filters-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** the types + registry.

```ts
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
  { value: "issued", label: "Versandt" },
  { value: "ausstehend", label: "Ausstehend" },
];

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
```

(Kategorie options for ausgaben/einnahmen are loaded at runtime via `listKategorieOptions(kind)` and injected into the field's `options`; the registry leaves `options` undefined for runtime-loaded fields. Document this in a comment.)

- [ ] **Step 4: Run via fast lane → passes.**

Run: `pnpm test:fast --run tests/unit/transaction-filters-registry.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/transaction-filters.ts tests/unit/transaction-filters-registry.test.ts
git commit -m "feat(filters): typed per-tab filter registry (spec §5)"
```

---

### Task 2: URL ⇄ filter-state serialize/parse + Zod v4 validation (pure) `[model: opus]`

**Files:** Modify `src/lib/domain/transaction-filters.ts` (add `FilterState`, `parseFilterState`, `serializeFilterState`); Test `tests/unit/transaction-filters-url.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/transaction-filters-url.test.ts
import { describe, it, expect } from "vitest";
import {
  parseFilterState,
  serializeFilterState,
} from "$lib/domain/transaction-filters.js";

describe("filter state URL round-trip + validation", () => {
  it("parses valid params for a tab", () => {
    const s = parseFilterState(
      "ausgaben",
      new URLSearchParams(
        "status=offen,geprueft&bezahltVon=member&q=miete&monat=5",
      ),
    );
    expect(s.enums.status).toEqual(["offen", "geprueft"]);
    expect(s.enums.bezahltVon).toEqual(["member"]);
    expect(s.search).toBe("miete");
    expect(s.enums.monat).toEqual(["5"]);
  });
  it("drops unknown/invalid values without throwing (Zod-validated)", () => {
    const s = parseFilterState(
      "ausgaben",
      new URLSearchParams("status=bogus&betragMin=abc&unknownField=x"),
    );
    expect(s.enums.status ?? []).toEqual([]); // 'bogus' not an allowed status
    expect(s.amount.betragMin).toBeUndefined(); // 'abc' not a number
  });
  it("round-trips: serialize(parse(x)) yields equivalent params", () => {
    const params = new URLSearchParams(
      "status=offen&betragMin=1000&betragMax=5000&mitRechnung=true",
    );
    const round = new URLSearchParams(
      serializeFilterState("einnahmen", parseFilterState("einnahmen", params)),
    );
    expect(round.get("betragMin")).toBe("1000");
    expect(round.get("mitRechnung")).toBe("true");
  });
});
```

- [ ] **Step 2: Run via fast lane → fails.**

Run: `pnpm test:fast --run tests/unit/transaction-filters-url.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `FilterState` + a Zod-v4 schema derived from the registry, plus parse/serialize. (Year is NOT part of FilterState — it's the global `?year=`, handled separately in Task 3.)

```ts
// add to src/lib/domain/transaction-filters.ts
import { z } from "zod";

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
```

- [ ] **Step 4: Run via fast lane → passes.**

Run: `pnpm test:fast --run tests/unit/transaction-filters-url.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/transaction-filters.ts tests/unit/transaction-filters-url.test.ts
git commit -m "feat(filters): URL<->filter-state serialize/parse with Zod v4 validation"
```

---

### Task 3: Year-scope helpers — "Alle Jahre" + stale-year (pure) `[model: opus]`

**Files:** Modify `src/lib/domain/year.ts` (add `ALL_YEARS`, `selectYearOrAllFromUrl`, `isStaleYear`); Test `tests/unit/year-scope.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/unit/year-scope.test.ts
import { describe, it, expect } from "vitest";
import {
  selectYearOrAllFromUrl,
  isStaleYear,
  ALL_YEARS,
} from "$lib/domain/year.js";

describe("year scope (Alle Jahre + stale)", () => {
  it("?year=all → ALL_YEARS sentinel (lists only)", () => {
    expect(selectYearOrAllFromUrl(new URLSearchParams("year=all"), 2026)).toBe(
      ALL_YEARS,
    );
  });
  it("missing/garbage → fallback current year", () => {
    expect(selectYearOrAllFromUrl(new URLSearchParams(""), 2026)).toBe(2026);
    expect(selectYearOrAllFromUrl(new URLSearchParams("year=zzz"), 2026)).toBe(
      2026,
    );
  });
  it("isStaleYear: true only for a concrete past/other year, false for current and for ALL_YEARS", () => {
    expect(isStaleYear(2024, 2026)).toBe(true);
    expect(isStaleYear(2026, 2026)).toBe(false);
    expect(isStaleYear(ALL_YEARS, 2026)).toBe(false);
  });
});
```

- [ ] **Step 2: Run via fast lane → fails.**

Run: `pnpm test:fast --run tests/unit/year-scope.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** in `src/lib/domain/year.ts`.

```ts
export const ALL_YEARS = "all" as const;
export type YearScope = number | typeof ALL_YEARS;

/** Lists only: accepts ?year=all. Concrete years go through the existing bounds check. */
export function selectYearOrAllFromUrl(
  params: URLSearchParams,
  fallback: number,
): YearScope {
  if (params.get("year") === ALL_YEARS) return ALL_YEARS;
  return selectYearFromUrl(params, fallback);
}

/** Banner trigger: concrete year that isn't the current one. Never for ALL_YEARS. */
export function isStaleYear(scope: YearScope, currentYear: number): boolean {
  return scope !== ALL_YEARS && scope !== currentYear;
}
```

- [ ] **Step 4: Run via fast lane → passes.**

Run: `pnpm test:fast --run tests/unit/year-scope.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/year.ts tests/unit/year-scope.test.ts
git commit -m "feat(year): Alle Jahre scope + isStaleYear helper (spec §6)"
```

---

### Task 4: Per-field SQL predicate builders (pure, against Drizzle expressions) `[model: opus]`

Opus: correctness of the WHERE fragments (incl. the status→enum mapping and the Rechnung EXISTS).

**Files:** Create `src/lib/server/domain/transaction-filter-sql.ts`; Test `tests/unit/transaction-filter-sql.test.ts`

- [ ] **Step 1: Write the failing test** — assert each builder returns a Drizzle SQL condition with the expected shape (use `drizzle-orm`'s `sql` inspection: render the condition to a parameterized query via the same util existing tests use, or assert it's defined + composes). Keep it pure (no DB) by testing the SQL string fragments.

```ts
// tests/unit/transaction-filter-sql.test.ts
import { describe, it, expect } from "vitest";
import { buildAusgabenWhere } from "$lib/server/domain/transaction-filter-sql.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

describe("ausgaben WHERE builder", () => {
  it("maps status 'offen' to (zu_pruefen, in_pruefung) and includes geprueft", async () => {
    const state = parseFilterState(
      "ausgaben",
      new URLSearchParams("status=offen,geprueft"),
    );
    const conds = buildAusgabenWhere(state, 2026);
    // Render the composed condition with the real PG dialect (pure — no DB connection)
    // and assert on the bound params. This is reliable, unlike JSON.stringify on a SQL object.
    const { and } = await import("drizzle-orm");
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const { params } = new PgDialect().sqlToQuery(and(...conds)!);
    expect(params).toEqual(
      expect.arrayContaining(["zu_pruefen", "in_pruefung", "geprueft"]),
    );
  });
});
```

> `new PgDialect().sqlToQuery(condition)` compiles to `{ sql, params }` without a DB connection, so this stays a pure fast-lane test. `inArray(status, [...])` binds the enum values as **params** (not inlined text), which is exactly what we assert on. The contract: status `offen` expands to both `zu_pruefen` and `in_pruefung`. Task 5's DB test is the behavioral backstop.

- [ ] **Step 2: Run via fast lane → fails.**

Run: `pnpm test:fast --run tests/unit/transaction-filter-sql.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** builders returning `SQL[]` (one per active field), composed with `and(...)` by the caller (Task 5). Cover: status (with offen→zu_pruefen/in_pruefung mapping), bezahltVon, kategorie (by `kategorieNameSnapshot` IN), monat (EXTRACT), betrag range (betrag_cents), belegFehlt (`beleg_file_id IS NULL AND beleg_verzicht_grund IS NULL`), year (`eq(yearOfBuchung, year)` unless ALL_YEARS), search (ilike), and for einnahmen the **mitRechnung** EXISTS:

```ts
import { and, eq, gte, lte, ilike, inArray, sql, isNull } from "drizzle-orm";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { ALL_YEARS, type YearScope } from "$lib/domain/year.js";
import type { FilterState } from "$lib/domain/transaction-filters.js";

const STATUS_MAP: Record<string, string[]> = {
  offen: ["zu_pruefen", "in_pruefung"],
  geprueft: ["geprueft"],
  erstattet: ["erstattet"],
  abgelehnt: ["abgelehnt"],
  importiert: ["importiert"],
};

export function buildAusgabenWhere(s: FilterState, year: YearScope) {
  const c = [];
  if (year !== ALL_YEARS) c.push(eq(expenses.yearOfBuchung, year));
  if (s.search)
    c.push(
      sql`(${expenses.bezeichnung} ILIKE ${`%${s.search}%`} OR ${expenses.bezahltVonDisplay} ILIKE ${`%${s.search}%`})`,
    );
  if (s.enums.status?.length) {
    const dbVals = s.enums.status.flatMap((v) => STATUS_MAP[v] ?? []);
    if (dbVals.length) c.push(inArray(expenses.status, dbVals as any));
  }
  if (s.enums.bezahltVon?.length)
    c.push(inArray(expenses.bezahltVonKind, s.enums.bezahltVon as any));
  if (s.enums.kategorie?.length)
    c.push(inArray(expenses.kategorieNameSnapshot, s.enums.kategorie));
  if (s.enums.monat?.length)
    c.push(
      sql`EXTRACT(MONTH FROM ${expenses.gebuchtAm} AT TIME ZONE 'Europe/Berlin')::int IN (${sql.join(
        s.enums.monat.map((m) => sql`${Number(m)}`),
        sql`, `,
      )})`,
    );
  if (s.amount.betragMin != null)
    c.push(gte(expenses.betragCents, BigInt(s.amount.betragMin)));
  if (s.amount.betragMax != null)
    c.push(lte(expenses.betragCents, BigInt(s.amount.betragMax)));
  if (s.booleans.belegFehlt)
    c.push(
      and(isNull(expenses.belegFileId), isNull(expenses.belegVerzichtGrund)),
    );
  return c;
}

export function buildEinnahmenWhere(s: FilterState, year: YearScope) {
  const c = [];
  if (year !== ALL_YEARS) c.push(eq(income.yearOfBuchung, year));
  if (s.search) c.push(ilike(income.bezeichnung, `%${s.search}%`));
  if (s.enums.kategorie?.length)
    c.push(inArray(income.kategorieNameSnapshot, s.enums.kategorie));
  if (s.enums.sphaere?.length)
    c.push(inArray(income.sphereSnapshot, s.enums.sphaere as any));
  if (s.enums.monat?.length)
    c.push(
      sql`EXTRACT(MONTH FROM ${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin')::int IN (${sql.join(
        s.enums.monat.map((m) => sql`${Number(m)}`),
        sql`, `,
      )})`,
    );
  if (s.amount.betragMin != null)
    c.push(gte(income.betragCents, BigInt(s.amount.betragMin)));
  if (s.amount.betragMax != null)
    c.push(lte(income.betragCents, BigInt(s.amount.betragMax)));
  if (s.booleans.mitRechnung)
    c.push(
      sql`EXISTS (SELECT 1 FROM ${invoices} WHERE ${invoices.paidByIncomeId} = ${income.id})`,
    );
  return c;
}

export function buildSpendenWhere(s: FilterState, year: YearScope) {
  const c = [];
  if (year !== ALL_YEARS) c.push(eq(donations.yearOfBuchung, year));
  if (s.search)
    c.push(
      sql`(${donations.spenderName} ILIKE ${`%${s.search}%`} OR ${donations.kategorieNameSnapshot} ILIKE ${`%${s.search}%`})`,
    );
  if (s.enums.spendenart?.length)
    c.push(inArray(donations.spendeKind, s.enums.spendenart as any));
  if (s.enums.zweckbindung?.length)
    c.push(inArray(donations.zweckbindungKind, s.enums.zweckbindung as any));
  if (
    s.enums.bescheinigung?.includes("issued") &&
    !s.enums.bescheinigung?.includes("ausstehend")
  )
    c.push(sql`${donations.bescheinigungNr} IS NOT NULL`);
  if (
    s.enums.bescheinigung?.includes("ausstehend") &&
    !s.enums.bescheinigung?.includes("issued")
  )
    c.push(isNull(donations.bescheinigungNr));
  if (s.members.spender) c.push(eq(donations.memberId, s.members.spender));
  if (s.enums.monat?.length)
    c.push(
      sql`EXTRACT(MONTH FROM ${donations.gebuchtAm} AT TIME ZONE 'Europe/Berlin')::int IN (${sql.join(
        s.enums.monat.map((m) => sql`${Number(m)}`),
        sql`, `,
      )})`,
    );
  if (s.amount.betragMin != null)
    c.push(gte(donations.betragCents, BigInt(s.amount.betragMin)));
  if (s.amount.betragMax != null)
    c.push(lte(donations.betragCents, BigInt(s.amount.betragMax)));
  return c;
}
```

- [ ] **Step 4: Run via fast lane → passes** (adjust the assertion mechanism per Step 1's note if needed).

Run: `pnpm test:fast --run tests/unit/transaction-filter-sql.test.ts`
Expected: pass.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/server/domain/transaction-filter-sql.ts tests/unit/transaction-filter-sql.test.ts
git commit -m "feat(filters): per-tab SQL WHERE builders (status mapping, EXISTS rechnung, month, amount)"
```

---

### Task 5: Per-tab paginated query functions (real SQL LIMIT/OFFSET + count) `[model: opus]`

Opus: this fixes the scaling bug and must paginate + count in SQL.

**Files:** Modify `src/lib/server/domain/transactions.ts` (add `listAusgabenPage`/`listEinnahmenPage`/`listSpendenPage`; deprecate the merged `listTransactions` slice path); Test `tests/integration/transaction-list-queries.test.ts`

- [ ] **Step 1: Write the failing test** (DB; seeds exist from Phase 1 corpus).

```ts
// tests/integration/transaction-list-queries.test.ts
import { describe, it, expect } from "vitest";
import {
  listAusgabenPage,
  listEinnahmenPage,
  listSpendenPage,
} from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

describe("per-tab paginated queries", () => {
  it("ausgaben: filter status=erstattet returns only erstattet, with SQL-side total", async () => {
    const state = parseFilterState(
      "ausgaben",
      new URLSearchParams("status=erstattet"),
    );
    const { rows, total } = await listAusgabenPage({
      state,
      year: 2026,
      limit: 5,
      offset: 0,
    });
    expect(rows.every((r) => r.status === "erstattet")).toBe(true);
    expect(typeof total).toBe("number");
    expect(rows.length).toBeLessThanOrEqual(5);
  });
  it("einnahmen: mitRechnung=true returns only invoice-linked income", async () => {
    const state = parseFilterState(
      "einnahmen",
      new URLSearchParams("mitRechnung=true"),
    );
    const { rows } = await listEinnahmenPage({
      state,
      year: 2026,
      limit: 50,
      offset: 0,
    });
    // corpus seeds exactly one invoice-linked income (spec §4.7)
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
  it("spenden: bescheinigung=ausstehend returns only rows without a B-Nummer", async () => {
    const state = parseFilterState(
      "spenden",
      new URLSearchParams("bescheinigung=ausstehend"),
    );
    const { rows } = await listSpendenPage({
      state,
      year: 2026,
      limit: 50,
      offset: 0,
    });
    expect(rows.every((r) => r.bescheinigungNr == null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → fails.**

Run: `pnpm test --run tests/integration/transaction-list-queries.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement** the three query functions: build conditions via Task 4 builders, `and(...conds)`, select the tab's row shape, `.orderBy(desc(gebuchtAm))`, `.limit(limit).offset(offset)`; run a parallel `count()` with the same WHERE for `total`. Each returns `{ rows, total }`. Support `year: YearScope` (skip the year predicate when `ALL_YEARS`). Keep `listTransactions` for now (used by the current merged route until Phase 3 replaces it) but mark it `@deprecated` in a comment pointing to the per-tab fns.

```ts
import { and, desc, sql } from "drizzle-orm";
// ...
export async function listAusgabenPage(opts: {
  state: FilterState;
  year: YearScope;
  limit: number;
  offset: number;
}) {
  const db = getDb();
  const conds = buildAusgabenWhere(opts.state, opts.year);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        /* TransactionRow projection for expenses */
      })
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.gebuchtAm))
      .limit(opts.limit)
      .offset(opts.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(where),
  ]);
  return { rows: rows.map(mapExpenseRow), total: count };
}
// listEinnahmenPage / listSpendenPage analogous with their builders + projections.
```

**Per-tab row projections MUST include each tab's display-specific fields** (so the tab tracks in Tier C render without ever editing `transactions.ts` — parallel-safety):
- **Ausgaben row:** the base fields + `status`, `bezahltVonKind`, `bezahltVonDisplay`, `erstattetAm`, `belegFileId` (presence), `approvedAt` (for the "offen"/aging logic).
- **Einnahmen row:** base + `rechnungBusinessId: string | null` via a correlated subquery/left-join on `invoices.paidByIncomeId = income.id` (the 🔗 badge source — there is no income column, so project it here, NOT in the tab).
- **Spenden row:** base + `spenderName`, `spendeKind`, `zweckbindungKind`, `bescheinigungNr` (the Bescheinigung-status + Art/Zweckbindung columns).
Define a `*Row` type per tab next to each `listXPage`; the Phase-3 `TransactionListScaffold` `ColumnDef.render` snippets bind to these fields.

- [ ] **Step 4: Run → passes.**

Run: `pnpm test --run tests/integration/transaction-list-queries.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/server/domain/transactions.ts tests/integration/transaction-list-queries.test.ts
git commit -m "feat(tx): per-tab paginated list queries with SQL LIMIT/OFFSET + count (fixes client-side slice)"
```

---

### Task 6: `listMemberOptions()` shared loader `[model: sonnet]`

**Files:** Modify `src/lib/server/domain/transaction-pickers.ts` (add loader); Test `tests/integration/member-options.test.ts`

- [ ] **Step 1: Write the failing test.**

```ts
// tests/integration/member-options.test.ts
import { describe, it, expect } from "vitest";
import { listMemberOptions } from "$lib/server/domain/transaction-pickers.js";
describe("listMemberOptions", () => {
  it("returns members as {id,label} sorted by name", async () => {
    const opts = await listMemberOptions();
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.length).toBeGreaterThan(0); // Phase 1 seed-fixtures seeds ≥1 member
    if (opts.length > 1)
      expect(opts[0].label.localeCompare(opts[1].label)).toBeLessThanOrEqual(0);
    if (opts.length) {
      expect(typeof opts[0].id).toBe("string");
      expect(typeof opts[0].label).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run tests/integration/member-options.test.ts` → FAIL.

- [ ] **Step 3: Implement** (full name, sorted — consolidates the inline member loads):

```ts
export interface MemberOption {
  id: string;
  label: string;
}
export async function listMemberOptions(): Promise<MemberOption[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: members.id,
      vorname: members.vorname,
      nachname: members.nachname,
    })
    .from(members)
    .orderBy(members.nachname, members.vorname);
  return rows.map((m) => ({
    id: m.id,
    label: `${m.vorname} ${m.nachname}`.trim(),
  }));
}
```

- [ ] **Step 4: Run → passes.** Expected `1 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/server/domain/transaction-pickers.ts tests/integration/member-options.test.ts
git commit -m "feat(pickers): listMemberOptions() shared loader for member-picker filter"
```

---

### Task 7: Saved-views store (localStorage; presets + rename/delete/overwrite) `[model: sonnet]`

Sonnet: well-bounded client store with explicit behavior; uses Task 2's serializer (no `getFullYear()` — ADR-0001).

**Files:** Create `src/lib/client/saved-views.ts`; Test `tests/unit/saved-views.test.ts`

- [ ] **Step 1: Write the failing test** (happy-dom provides `localStorage`; pure-ish, use fast lane).

```ts
// tests/unit/saved-views.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  listViews,
  saveView,
  renameView,
  deleteView,
  BUILTIN_PRESETS,
} from "$lib/client/saved-views.js";

beforeEach(() => localStorage.clear());
describe("saved views", () => {
  it("includes built-in presets for the tab", () => {
    const v = listViews("ausgaben");
    expect(v.some((x) => x.id === BUILTIN_PRESETS.ausgaben[0].id)).toBe(true);
  });
  it("save → rename → delete a custom view round-trips", () => {
    saveView("ausgaben", { name: "Meine", query: "status=offen" });
    let mine = listViews("ausgaben").find((x) => x.name === "Meine");
    expect(mine).toBeTruthy();
    renameView("ausgaben", mine!.id, "Umbenannt");
    expect(listViews("ausgaben").find((x) => x.id === mine!.id)!.name).toBe(
      "Umbenannt",
    );
    deleteView("ausgaben", mine!.id);
    expect(
      listViews("ausgaben").find((x) => x.id === mine!.id),
    ).toBeUndefined();
  });
  it("cannot delete a built-in preset", () => {
    const preset = BUILTIN_PRESETS.ausgaben[0];
    deleteView("ausgaben", preset.id);
    expect(listViews("ausgaben").some((x) => x.id === preset.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run via fast lane → fails.** `pnpm test:fast --run tests/unit/saved-views.test.ts` → FAIL.

- [ ] **Step 3: Implement** with a namespaced key (`fdw:tx-views:<tab>`), try/catch (Safari private mode, per `pwa-entry.ts` convention), built-in presets as code (Ausgaben "Offen zu erstatten" = `status=offen,geprueft`-style query string from Task 2; Spenden "Ohne Bescheinigung" = `bescheinigung=ausstehend`). Custom views store `{ id, name, query }` where `query` is the serialized filter string. Built-ins are non-deletable (id prefix `builtin:`).

- [ ] **Step 4: Run via fast lane → passes.** Expected `3 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/client/saved-views.ts tests/unit/saved-views.test.ts
git commit -m "feat(filters): saved-views store — presets + custom rename/delete (no getFullYear, ADR-0001)"
```

---

### Task 8: Shared chip filter-bar component (desktop chips + mobile sheet + count badge) `[model: opus]`

Opus: the reusable UI contract for all three tabs; a11y + responsive correctness.

**Files:** Create `src/lib/components/admin/transactions/FilterBar.svelte`; Test `src/lib/components/admin/transactions/FilterBar.test.ts`

- [ ] **Step 1: Write the failing component test** (`@testing-library/svelte`, mock `$app/navigation`).

```ts
// FilterBar.test.ts
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import FilterBar from "./FilterBar.svelte";
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
// FilterBar reads $page.url to serialize current state → also mock $app/stores (mirror MobileTabBar.test.ts):
vi.mock("$app/stores", async () => {
  const { readable } = await import("svelte/store");
  return {
    page: readable({ url: new URL("http://localhost/app/ausgaben"), data: {} }),
  };
});

describe("FilterBar", () => {
  it("renders a chip per active filter + a reset control", async () => {
    render(FilterBar, {
      props: {
        tab: "ausgaben",
        state: {
          enums: { status: ["offen"] },
          members: {},
          amount: {},
          booleans: {},
        },
        kategorieOptions: [],
        memberOptions: [],
        resultCount: 7,
      },
    });
    expect(await screen.findByText(/Status/)).toBeTruthy();
    expect(screen.getByText(/7/)).toBeTruthy(); // live count
    expect(screen.getByRole("button", { name: /Zurücksetzen/i })).toBeTruthy();
  });
  it("shows a filter-count badge on the +Filter trigger when filters are active", () => {
    render(FilterBar, {
      props: {
        tab: "ausgaben",
        state: {
          enums: { status: ["offen"], bezahltVon: ["member"] },
          members: {},
          amount: {},
          booleans: {},
        },
        kategorieOptions: [],
        memberOptions: [],
        resultCount: 3,
      },
    });
    expect(screen.getByTestId("filter-count-badge").textContent).toContain("2");
  });
});
```

- [ ] **Step 2: Run → fails.** `pnpm test --run src/lib/components/admin/transactions/FilterBar.test.ts` → FAIL.

- [ ] **Step 3: Implement** the presentational component: props `{ tab, state, kategorieOptions, memberOptions, resultCount }`; renders the persistent search input + "+ Filter" trigger (with `data-testid="filter-count-badge"` showing active-field count) + a removable chip per active filter (each `×` updates the URL via `serializeFilterState` + `goto`) + "Ansichten ▾" (wired to Task 7) + "Zurücksetzen" + the live `resultCount`. On mobile (`<sm`) the chips + "+ Filter" collapse into a `Sheet` (reuse `ui/sheet`); the search + year pill stay inline. Use the registry (Task 1) to render field pickers; enum-multi → checkboxes, member-picker → combobox over `memberOptions`, amount-range → two number inputs, boolean → toggle. A11y: chips focusable + removable via Backspace; 44px targets. **Render Sphäre/Status meaning consistent with §13** (this component only emits filter-state; rows are rendered by the tab pages in later phases).

- [ ] **Step 4: Run → passes.** Expected: `2 passed`.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/components/admin/transactions/FilterBar.svelte src/lib/components/admin/transactions/FilterBar.test.ts
git commit -m "feat(filters): shared chip FilterBar component (desktop chips + mobile sheet + count badge)"
```

---

### Task 9: Phase-boundary verification + milestone `[model: opus]`

- [ ] **Step 1: Run all Phase-2 pure tests (fast lane).**

Run: `pnpm test:fast --run tests/unit/transaction-filters-registry.test.ts tests/unit/transaction-filters-url.test.ts tests/unit/year-scope.test.ts tests/unit/transaction-filter-sql.test.ts tests/unit/saved-views.test.ts`
Expected: all pass, no reset.

- [ ] **Step 2: Run Phase-2 DB + component tests.**

Run: `pnpm test --run tests/integration/transaction-list-queries.test.ts tests/integration/member-options.test.ts src/lib/components/admin/transactions/FilterBar.test.ts`
Expected: all pass.

- [ ] **Step 3: Regression — the still-live merged route must keep working** (Phase 3 replaces it; until then `listTransactions` stays):

Run: `pnpm test --run src/lib/components/admin/transactions/TransactionsList.test.ts src/lib/components/admin/transactions/TypeTabsHeader.test.ts`
Expected: pass (these still exercise the old path; do not delete them this phase).

- [ ] **Step 4: Typecheck + lint (boundary only).**

Run: `pnpm check && pnpm lint`
Expected: no errors in touched files.

- [ ] **Step 5: Tag.**

```bash
git tag -f phase-2-filter-backbone-complete
```

Filter engine + saved-views + shared FilterBar are built and tested in isolation. Phase 3 wires them into the three flat routes (and retires the client-side `TransactionsList`/`SavedViewsBar`/`TypeTabsHeader`).

---

## Self-Review (run after writing; fixed inline)

1. **Spec coverage (§5/§6):** typed registry (T1) ✓; URL single-source + Zod validation (T2) ✓; server-side WHERE + pagination/count, fixes the slice bug (T4/T5) ✓; saved views presets + custom rename/delete, no getFullYear (T7) ✓; one shared component, three registries (T1/T8) ✓; mobile sheet + filter-count badge (T8) ✓; year not a chip — global scope + Alle Jahre + stale-year (T3) ✓; member-picker needs a loader (T6) ✓; "nur mit Rechnung" EXISTS (T4 einnahmen) ✓.
2. **Placeholder scan:** T4 Step 1 now asserts via `new PgDialect().sqlToQuery()` on the bound params (pure, reliable) — no longer the brittle `JSON.stringify`. T5 Step 3 row projection: `mapExpenseRow`/`mapIncomeRow`/`mapDonationRow` do **not** exist yet as named functions — `transactions.ts` does the projection with inline `for…push` loops (and the per-tab shapes differ: ausgaben needs `status`, spenden needs `bescheinigungNr`). The implementer **extracts** those inline loops into the named mappers (the `TransactionRow` type at `transactions.ts:30` is the reference for field names). Not a TBD — a concrete extraction. No other placeholders.
3. **Type/signature consistency:** `FilterState`, `parseFilterState`/`serializeFilterState` (T2) consumed by T4 builders, T5 query fns, T7 saved-views, T8 component; `YearScope`/`ALL_YEARS`/`isStaleYear` (T3) used in T4/T5; `listAusgabenPage/listEinnahmenPage/listSpendenPage({state,year,limit,offset})` consistent across T5 + the test.
4. **Scope boundary:** Phase 2 does NOT wire routes or retire the old components (Phase 3) — it ships the engine + component, each tested standalone; the old path stays green (T9 Step 3). This keeps Phase 2 independently shippable.
5. **Open dependency for Phase 3:** the three tab routes consume `listXPage` + `parseFilterState` + `selectYearOrAllFromUrl` + `FilterBar` + saved-views; `kategorieOptions` via `listKategorieOptions(kind)` (note: it keys on `"expense"|"income"`, so map `ausgaben→expense`, `einnahmen→income`), `memberOptions` via `listMemberOptions()`.
6. **Open dependency for Phase 3 — layout clamp:** the shipped `/app/+layout.server.ts` computes `selectedYear = clampYearToAvailable(selectYearFromUrl(...))`, which turns `?year=all` into the current year (NaN→fallback, then clamp). For "Alle Jahre" to reach the lists, Phase 3 must special-case `ALL_YEARS` in the layout (or have the tab routes read `selectYearOrAllFromUrl` directly off `url` instead of `data.selectedYear`). Flagged so Phase 3 doesn't silently lose the all-years path. The `importiert` status is now included in the registry + `STATUS_MAP` so imported rows remain filterable.
