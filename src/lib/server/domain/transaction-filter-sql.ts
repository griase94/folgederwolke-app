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
import { members, memberBeitrags } from "$lib/server/db/schema/members.js";
import { beitragBuchungsjahr } from "./beitrag-buchungsjahr.js";
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
  // Sphäre matches the EFFECTIVE sphere (override ?? snapshot) — the value the
  // row actually displays. Filtering the raw snapshot would hide a row whose
  // sphere was deliberately corrected (ADR-0008).
  if (s.enums.sphaere?.length)
    c.push(
      sql`COALESCE(${expenses.sphereOverride}, ${expenses.sphereSnapshot})::text IN (${sql.join(
        s.enums.sphaere.map((v) => sql`${v}`),
        sql`, `,
      )})`,
    );
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
  // Exclude Storno originals — a superseded donation is replaced by its
  // correction row, so counting both double-counts. The EÜR + Hub already
  // filter `supersedes_id IS NULL`; without the same predicate here the
  // transaction feed over-counts in a Storno year and the Buchungslisten-Fuß
  // reconciliation (feed + Beiträge == EÜR) breaks. Mirror the income arm.
  c.push(isNull(donations.supersedesId));
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
  if (s.enums.sphaere?.length)
    c.push(
      inArray(
        donations.sphereSnapshot,
        s.enums
          .sphaere as (typeof donations.sphereSnapshot.enumValues)[number][],
      ),
    );
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

/**
 * S3 — the Mitgliedsbeitrags arm of the unified feed.
 *
 * Expects `member_beitrags` joined to `members` WITHOUT table aliases, so the
 * Drizzle column references below render as `"member_beitrags"."…"` /
 * `"members"."…"`.
 *
 * Two predicates are unconditional rather than filter-driven: only realized
 * cashflow is a transaction at all (the same `gezahlt_am IS NOT NULL AND
 * paid_cents > 0` the EÜR union uses — an unpaid Beitrag is a debt and belongs
 * in the "offene Beiträge" KPI, not in a money feed), and the year scope is the
 * Zufluss year (S2), so a Beitrag appears in the feed of the year its money
 * actually arrived.
 *
 * Kategorie and "Beleg fehlt" are absent by design — they can't describe a
 * Beitrag, so `feedKindsSupported` drops this arm entirely rather than letting
 * it silently return nothing (the honesty rule).
 */
export function buildBeitragWhere(s: FilterState, year: YearScope): SQL[] {
  const c: SQL[] = [];
  c.push(isNotNull(memberBeitrags.gezahltAm));
  c.push(sql`${memberBeitrags.paidCents} > 0`);
  if (year !== ALL_YEARS) c.push(sql`${beitragBuchungsjahr} = ${year}`);
  if (s.search)
    c.push(
      sql`(concat_ws(' ', ${members.vorname}, ${members.nachname}) ILIKE ${`%${s.search}%`}
           OR ('Mitgliedsbeitrag ' || ${memberBeitrags.year}::text) ILIKE ${`%${s.search}%`})`,
    );
  // Beiträge are always ideeller (§§ 51-68 AO), so the Sphären filter CAN
  // describe them: comparing the constant against the selection yields TRUE
  // when 'ideeller' is among the picks and FALSE otherwise — an honest empty
  // result, not an inexpressible one.
  if (s.enums.sphaere?.length)
    c.push(
      sql`'ideeller' IN (${sql.join(
        s.enums.sphaere.map((v) => sql`${v}`),
        sql`, `,
      )})`,
    );
  // gezahlt_am is a `date` — no timezone conversion (see beitrag-buchungsjahr).
  if (s.enums.monat?.length)
    c.push(
      sql`EXTRACT(MONTH FROM ${memberBeitrags.gezahltAm})::int IN (${sql.join(
        s.enums.monat.map((m) => sql`${Number(m)}`),
        sql`, `,
      )})`,
    );
  // The amount that matters is what was PAID, not the Soll.
  if (s.amount.betragMin != null)
    c.push(gte(memberBeitrags.paidCents, BigInt(s.amount.betragMin)));
  if (s.amount.betragMax != null)
    c.push(lte(memberBeitrags.paidCents, BigInt(s.amount.betragMax)));
  return c;
}
