import { sql } from "drizzle-orm";
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { sourceKindEnum } from "./enums.js";

export const fileKindEnum = pgEnum("file_kind", [
  "beleg",
  "rechnung",
  "bescheinigung",
  "export",
]);

export const files = pgTable(
  "files",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    storageKey: text("storage_key").notNull(),
    storageBackend: text("storage_backend").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: bigint("byte_size", { mode: "bigint" }).notNull(),
    sha256: text("sha256").notNull(),
    originalFilename: text("original_filename").notNull(),
    kind: fileKindEnum("kind").notNull(),
    thumbnailStorageKey: text("thumbnail_storage_key"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    uploadedBySubmitterEmail: text("uploaded_by_submitter_email"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deleteReason: text("delete_reason"),
    sourceKind: sourceKindEnum("source_kind").notNull(),
    yearOfBuchung: integer("year_of_buchung"),
  },
  (t) => ({
    storageKeyUq: uniqueIndex("idx_files_storage_key").on(t.storageKey),
    sha256ActiveUq: uniqueIndex("idx_files_sha256_active")
      .on(t.sha256)
      .where(sql`deleted_at IS NULL`),
    uploadedAtIdx: index("idx_files_uploaded_at").on(t.uploadedAt),
    yearIdx: index("idx_files_year").on(t.yearOfBuchung),
    kindYearIdx: index("idx_files_kind_year").on(t.kind, t.yearOfBuchung),
  }),
);
