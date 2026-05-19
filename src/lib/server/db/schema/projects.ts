/**
 * Projekte & Events (legacy "Projekte & Events" sheet).
 *
 * Per ADR-0008: `sphere_default` overrides the kategorie's sphere for any
 * expense linked to this project. Concrete case: a fundraising-event has
 * Honorar-Künstler:innen kategorie (zweckbetrieb sphere) but the event itself
 * is in the wirtschaftlich sphere. Setting `projects.sphere_default = 'wirtschaftlich'`
 * routes those costs to the right column on the EÜR.
 *
 * The legacy sheet also stored a 4-digit P-ID per project; we map that to
 * `business_id` for parity with importer behaviour (ADR-0010).
 */
// TODO multi-tenant: add verein_id

import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sphereEnum } from "./enums.js";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Legacy P-ID (P-2026-001 style). Preserved verbatim by importer. */
    businessId: text("business_id").notNull(),
    name: text("name").notNull(),
    /** Per ADR-0008 — overrides kategorie.sphere for expenses linked here. */
    sphereDefault: sphereEnum("sphere_default"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    isFixture: boolean("is_fixture").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    businessIdUq: uniqueIndex("projects_business_id_uq").on(t.businessId),
    nameIdx: index("projects_name_idx").on(t.name),
  }),
);
