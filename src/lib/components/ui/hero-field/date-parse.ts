/**
 * Locale-locked (de-DE) date helpers for the hero DateField.
 *
 * TT.MM.JJJJ display ⇄ canonical ISO YYYY-MM-DD. Invalid calendar dates
 * (e.g. 30.02.2026) are rejected rather than silently clamped, matching the
 * legacy $lib/components/ui/date-field logic.
 */
import { CalendarDate, parseDate } from "@internationalized/date";

export function isoToDisplay(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  try {
    const d = parseDate(iso);
    const dd = String(d.day).padStart(2, "0");
    const mm = String(d.month).padStart(2, "0");
    const yyyy = String(d.year).padStart(4, "0");
    return `${dd}.${mm}.${yyyy}`;
  } catch {
    return "";
  }
}

export function displayToIso(display: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(display.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  try {
    // CalendarDate clamps out-of-range days (Feb 30 → Feb 28) instead of
    // throwing, so verify the round-trip to catch invalid calendar dates.
    const cd = new CalendarDate(year, month, day);
    if (cd.day !== day || cd.month !== month || cd.year !== year) return null;
    return cd.toString();
  } catch {
    return null;
  }
}

export function isWithinBounds(
  iso: string,
  min?: string,
  max?: string,
): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}
