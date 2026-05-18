/**
 * Per-(year, kind) sequence row (ADR-0010).
 *
 * Used to produce business_ids like `A-2026-007` deterministically across
 * concurrent inserts. `next_value` is incremented inside a transaction
 * (SELECT ... FOR UPDATE) before the row gets its business_id.
 *
 * Counter seeding from imported corpus: `seed_id_counter_from_corpus(year, kind)`
 * PL/pgSQL function (drizzle/sql/seed_id_counter_from_corpus.sql) sets
 * `next_value = MAX(parsed_seq) + 1` for the (year, kind) pair after a
 * sheet import — ensures fresh app-issued IDs don't collide with imported
 * legacy ones.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const idCounters = pgTable(
  "id_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    /** business_id prefix: 'A' | 'E' | 'S' | 'FDW' | 'B' | 'AUS' (text, not enum, importer-friendly). */
    kind: text("kind").notNull(),
    nextValue: bigint("next_value", { mode: "bigint" })
      .notNull()
      .default(sql`1`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    yearKindUq: uniqueIndex("id_counters_year_kind_uq").on(t.year, t.kind),
  }),
);
