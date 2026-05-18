/**
 * Zahlungsarten — payment methods (Banküberweisung, PayPal, Bar, Lastschrift,
 * Verrechnung, Verzichts-Spende per legacy STAMMDATEN_ZAHLUNGSARTEN +
 * Verzichts-Spende for Aufwandsspende preparation in Phase 2).
 *
 * `kind` is the canonical enum; `label` is the display string (German with
 * potential parentheses, e.g. "PayPal (privates Konto)").
 */
// TODO multi-tenant: add verein_id

import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { zahlungsartKindEnum } from "./enums.js";

export const zahlungsarten = pgTable(
  "zahlungsarten",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: zahlungsartKindEnum("kind").notNull(),
    label: text("label").notNull(),
    deactivated: boolean("deactivated").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    labelUq: uniqueIndex("zahlungsarten_label_uq").on(t.label),
    kindIdx: index("zahlungsarten_kind_idx").on(t.kind),
  }),
);
