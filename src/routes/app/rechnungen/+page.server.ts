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
 *           Also exposes `today` (Berlin local ISO date string) so the
 *           per-row inline mark-paid panel can default to today and bound
 *           the DateField max.
 *
 * actions →
 *   - `mark-paid` (P12-D): mirrors the detail-page action so a row's inline
 *     kebab → "Als bezahlt markieren" can POST directly to the list page.
 *     Same domain call (`markInvoiceAsPaid`), redirects back here with
 *     `?paid=1` for a toast.
 */

import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  listInvoices,
  listInvoicesMeta,
  markInvoiceAsPaid,
} from "$lib/server/domain/invoices.js";
import { parseInvoiceFilters } from "$lib/domain/invoices.js";
import { yearForBooking } from "$lib/domain/year.js";

export const load: PageServerLoad = async ({ url }) => {
  const defaultYear = yearForBooking(new Date());
  const filters = parseInvoiceFilters(url.searchParams, defaultYear);

  const [items, meta] = await Promise.all([
    listInvoices({
      status: filters.status,
      year: filters.year,
    }),
    // Year-wide aggregate for the header + filter-chip counts (independent of
    // the active status filter, so the chips always show the full picture).
    listInvoicesMeta({ year: filters.year }),
  ]);

  // Berlin-local YYYY-MM-DD — used as the default + max bound for the inline
  // mark-paid DateField in each row. Domain re-checks the upper bound on
  // submit (`markInvoiceAsPaid`).
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return { invoices: items, meta, filters, today };
};

export const actions: Actions = {
  // P12-D: per-row inline mark-paid POSTs here. Same domain call as the
  // detail-page action; differs only in the redirect target.
  "mark-paid": async ({ request, locals }) => {
    const actorUserId = locals.session?.user.id ?? null;
    const formData = await request.formData();
    const invoiceId = formData.get("invoiceId")?.toString() ?? "";
    const bezahltAm = formData.get("bezahltAm")?.toString() ?? "";

    if (!invoiceId || !bezahltAm) {
      return fail(400, { action: "mark-paid", error: "Fehlende Parameter" });
    }

    const result = await markInvoiceAsPaid(invoiceId, bezahltAm, actorUserId);
    if (!result.ok) {
      return fail(result.status, { action: "mark-paid", error: result.error });
    }
    throw redirect(303, `/app/rechnungen?paid=1`);
  },
};
