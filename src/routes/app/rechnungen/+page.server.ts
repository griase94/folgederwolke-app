/**
 * /app/rechnungen — list of all invoices the Verein has issued.
 *
 * load()  → invoices joined with customer name + flagged with whether they
 *           have been superseded by a newer correction.
 *
 *           Honours two URL searchParams (used by the dashboard chip
 *           "Offene Rechnungen" — links to ?status=offen&year=<year>):
 *             - status: "offen" | "bezahlt" | "überfällig" | "alle"
 *             - year:   integer (Buchungsjahr, defaults to current
 *                       Berlin year per ADR-0001 / yearForBooking)
 *           Anything unknown falls back to defaults so a hand-typed garbage
 *           URL doesn't 500.
 *
 * Actions live on the [id] / new sub-routes — this list page is read-only.
 */

import type { PageServerLoad } from "./$types.js";
import { listInvoices } from "$lib/server/domain/invoices.js";
import { parseInvoiceFilters } from "$lib/domain/invoices.js";
import { yearForBooking } from "$lib/domain/year.js";

export const load: PageServerLoad = async ({ url }) => {
  const defaultYear = yearForBooking(new Date());
  const filters = parseInvoiceFilters(url.searchParams, defaultYear);

  const items = await listInvoices({
    status: filters.status,
    year: filters.year,
  });

  return { invoices: items, filters };
};
