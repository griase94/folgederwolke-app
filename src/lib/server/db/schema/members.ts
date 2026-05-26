/**
 * Mitglieder + Mitgliedsbeiträge (legacy Mitglieder + matrix-style yearly cells).
 *
 * Note: legacy stored Beiträge as columns per year on the Mitglieder sheet.
 * Here it's a tall table `member_beitrags(member_id, year, ...)` so we can
 * trivially add years, support partial payments, and back the
 * `v_offene_beitraege` view.
 */
// TODO multi-tenant: add verein_id

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { memberRoleEnum } from "./enums.js";

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vorname: text("vorname").notNull(),
    nachname: text("nachname").notNull(),
    email: text("email"),
    emailCanonical: text("email_canonical"),
    iban: text("iban"),
    telefon: text("telefon"),
    adresse: text("adresse"),
    dateOfBirth: date("date_of_birth"),
    role: memberRoleEnum("role").notNull().default("mitglied"),
    eintrittsDatum: date("eintritts_datum"),
    austrittsDatum: date("austritts_datum"),
    /**
     * Beitragspflicht ausgesetzt (Night-2 C5-MEM-full).
     * Exempt members are excluded from the `offen` sum and from the
     * bulk-reminder candidate list. `beitragExemptReason` is a free-text
     * justification (Ehrenmitglied, Härtefall, ...) shown as tooltip on
     * the "befreit" badge.
     */
    beitragExempt: boolean("beitrag_exempt").notNull().default(false),
    beitragExemptReason: text("beitrag_exempt_reason"),
    /** Sample/fixture rows for Phase 2-5 development before importer runs (Phase 6). */
    isFixture: boolean("is_fixture").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nachnameIdx: index("members_nachname_idx").on(t.nachname),
    emailCanonicalIdx: index("members_email_canonical_idx").on(
      t.emailCanonical,
    ),
  }),
);

/**
 * Per-(member, year) Beitrag row.
 *
 * `betrag_cents` is the rate for the year (legacy: MITGLIEDSBEITRAG_PER_JAHR_EUR
 * = €69.69, with potential year-overrides in the Einstellungen tab). `paid_cents`
 * accumulates payments. `gezahlt_am` is the latest payment date (or null).
 *
 * `v_offene_beitraege` view: rows where `paid_cents < betrag_cents` AND
 * the member is active in that year.
 */
export const memberBeitrags = pgTable(
  "member_beitrags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    betragCents: bigint("betrag_cents", { mode: "bigint" }).notNull(),
    /** STORED generated euro view of betrag_cents (ADR-0003). */
    betragEur: numeric("betrag_eur", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(sql`(betrag_cents::numeric / 100)`),
    paidCents: bigint("paid_cents", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    gezahltAm: date("gezahlt_am"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    memberYearUq: uniqueIndex("member_beitrags_member_year_uq").on(
      t.memberId,
      t.year,
    ),
    yearIdx: index("member_beitrags_year_idx").on(t.year),
  }),
);
