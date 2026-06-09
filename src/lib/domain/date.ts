import { z } from "zod";

/**
 * True iff `s` is a REAL calendar date in strict `YYYY-MM-DD` form.
 *
 * A bare `/^\d{4}-\d{2}-\d{2}$/` regex accepts impossible dates like
 * `2026-02-30` or `2026-13-01`; those then reach Postgres `::date` casts and
 * throw, surfacing as an opaque 500 (and, on the public Auslagen form, an
 * orphaned Blob upload). This round-trips the parts through a UTC `Date` and
 * checks losslessness, mirroring DateField's CalendarDate round-trip on the
 * client so the client and server agree on what "valid" means.
 */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Zod schema for a required real calendar date (`YYYY-MM-DD`). Use
 * `.nullable()` / `.optional()` at the call site for optional date fields.
 * Replaces bare `.regex(/^\d{4}-\d{2}-\d{2}$/)` validators so an impossible
 * date is a clean 422 field error, never a 500.
 */
export const isoCalendarDate = z
  .string()
  .refine(isValidIsoDate, { message: "Bitte ein gültiges Datum eingeben." });
