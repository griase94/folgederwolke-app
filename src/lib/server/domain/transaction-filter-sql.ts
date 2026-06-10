/**
 * Per-tab SQL WHERE builders for the Transactions filter backbone (Phase 2).
 *
 * Each builder takes a parsed `FilterState` (Task 1) plus the active
 * `YearScope` (Task 3) and returns an array of Drizzle `SQL` conditions — one
 * per active filter field. The Task-5 query functions compose them with
 * `and(...)`.
 *
 * These functions are PURE: they only construct Drizzle expression trees and
 * never touch a DB connection, so they're tested in the fast lane via
 * `new PgDialect().sqlToQuery(...)`.
 *
 * Review amendments incorporated:
 * - P2-02: accumulator typed `const c: SQL[]`; the belegFehlt `and(...)` is
 *   `!`-asserted so the array doesn't widen to `(SQL | undefined)[]`.
 * - P2-04: kategorie matches `kategorieNameSnapshot` (name-snapshot strings),
 *   NOT a kategorie id — per Task 1's `listKategorieOptions` contract.
 * - P2-05: `betragCents` is int8/bigint, so amount bounds are wrapped in
 *   `BigInt(...)` for the Drizzle binding.
 */
import {
  and,
  eq,
  gte,
  lte,
  ilike,
  inArray,
  sql,
  isNull,
  isNotNull,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { income } from "$lib/server/db/schema/income.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { ALL_YEARS, type YearScope } from "$lib/domain/year.js";
import type { FilterState } from "$lib/domain/transaction-filters.js";

/**
 * Maps a UI status filter value to the underlying DB enum value(s).
 * The UI "offen" bucket spans the two open states (`zu_pruefen`, `in_pruefung`).
 */
const STATUS_MAP: Record<string, string[]> = {
  offen: ["zu_pruefen", "in_pruefung"],
  geprueft: ["geprueft"],
  erstattet: ["erstattet"],
  abgelehnt: ["abgelehnt"],
  importiert: ["importiert"],
};

export function buildAusgabenWhere(s: FilterState, year: YearScope): SQL[] {
  const c: SQL[] = []; // typed SQL[] (not (SQL|undefined)[]) so Task 9 `pnpm check` passes
  if (year !== ALL_YEARS) c.push(eq(expenses.yearOfBuchung, year));
  if (s.search)
    c.push(
      sql`(${expenses.bezeichnung} ILIKE ${`%${s.search}%`} OR ${expenses.bezahltVonDisplay} ILIKE ${`%${s.search}%`})`,
    );
  if (s.enums.status?.length) {
    const dbVals = s.enums.status.flatMap((v) => STATUS_MAP[v] ?? []);
    if (dbVals.length)
      c.push(
        inArray(
          expenses.status,
          dbVals as (typeof expenses.status.enumValues)[number][],
        ),
      );
  }
  if (s.enums.bezahltVon?.length)
    c.push(
      inArray(
        expenses.bezahltVonKind,
        s.enums
          .bezahltVon as (typeof expenses.bezahltVonKind.enumValues)[number][],
      ),
    );
  // P2-04: s.enums.kategorie holds kategorieNameSnapshot strings (not ids), per Task 1 contract.
  if (s.enums.kategorie?.length)
    c.push(inArray(expenses.kategorieNameSnapshot, s.enums.kategorie));
  if (s.enums.monat?.length)
    c.push(
      sql`EXTRACT(MONTH FROM ${expenses.gebuchtAm} AT TIME ZONE 'Europe/Berlin')::int IN (${sql.join(
        s.enums.monat.map((m) => sql`${Number(m)}`),
        sql`, `,
      )})`,
    );
  // P2-05: betragCents is int8/bigint — Drizzle requires a BigInt binding, so wrap the JS number.
  if (s.amount.betragMin != null)
    c.push(gte(expenses.betragCents, BigInt(s.amount.betragMin)));
  if (s.amount.betragMax != null)
    c.push(lte(expenses.betragCents, BigInt(s.amount.betragMax)));
  if (s.booleans.belegFehlt)
    c.push(
      // and(...) is SQL | undefined; `!`-assert because both args are always defined here.
      and(isNull(expenses.belegFileId), isNull(expenses.belegVerzichtGrund))!,
    );
  return c;
}

export function buildEinnahmenWhere(s: FilterState, year: YearScope): SQL[] {
  const c: SQL[] = []; // typed SQL[] so Task 9 `pnpm check` passes
  // Exclude superseded (Storno-chained) rows — mirrors einnahmen-kpi.ts livePredicate.
  c.push(isNull(income.supersedesId));
  if (year !== ALL_YEARS) c.push(eq(income.yearOfBuchung, year));
  if (s.search) c.push(ilike(income.bezeichnung, `%${s.search}%`));
  // P2-04: s.enums.kategorie holds kategorieNameSnapshot strings (not ids), per Task 1 contract.
  if (s.enums.kategorie?.length)
    c.push(inArray(income.kategorieNameSnapshot, s.enums.kategorie));
  if (s.enums.sphaere?.length)
    c.push(
      inArray(
        income.sphereSnapshot,
        s.enums.sphaere as (typeof income.sphereSnapshot.enumValues)[number][],
      ),
    );
  if (s.enums.monat?.length)
    c.push(
      sql`EXTRACT(MONTH FROM ${income.gebuchtAm} AT TIME ZONE 'Europe/Berlin')::int IN (${sql.join(
        s.enums.monat.map((m) => sql`${Number(m)}`),
        sql`, `,
      )})`,
    );
  // P2-05: betragCents is int8/bigint — wrap the JS number in BigInt() for the Drizzle binding.
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

export function buildSpendenWhere(s: FilterState, year: YearScope): SQL[] {
  const c: SQL[] = []; // typed SQL[] so Task 9 `pnpm check` passes
  if (year !== ALL_YEARS) c.push(eq(donations.yearOfBuchung, year));
  if (s.search)
    c.push(
      sql`(${donations.spenderName} ILIKE ${`%${s.search}%`} OR ${donations.kategorieNameSnapshot} ILIKE ${`%${s.search}%`})`,
    );
  if (s.enums.spendenart?.length)
    c.push(
      inArray(
        donations.spendeKind,
        s.enums
          .spendenart as (typeof donations.spendeKind.enumValues)[number][],
      ),
    );
  if (s.enums.zweckbindung?.length)
    c.push(
      inArray(
        donations.zweckbindungKind,
        s.enums
          .zweckbindung as (typeof donations.zweckbindungKind.enumValues)[number][],
      ),
    );
  // Bescheinigung filter: each branch fires only when ONE state is selected.
  // Both "versandt" + "ausstehend" selected (or neither) => no predicate added (= no filter).
  if (
    s.enums.bescheinigung?.includes("versandt") &&
    !s.enums.bescheinigung?.includes("ausstehend")
  )
    c.push(isNotNull(donations.bescheinigungNr));
  if (
    s.enums.bescheinigung?.includes("ausstehend") &&
    !s.enums.bescheinigung?.includes("versandt")
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
  // P2-05: betragCents is int8/bigint — wrap the JS number in BigInt() for the Drizzle binding.
  if (s.amount.betragMin != null)
    c.push(gte(donations.betragCents, BigInt(s.amount.betragMin)));
  if (s.amount.betragMax != null)
    c.push(lte(donations.betragCents, BigInt(s.amount.betragMax)));
  return c;
}
