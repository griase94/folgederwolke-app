/**
 * /app/rechnungen — list of all invoices the Verein has issued.
 *
 * load()  → all invoices, newest first, joined with customer name + flagged
 *           with whether they have been superseded by a newer correction.
 *
 * Actions live on the [id] / new sub-routes — this list page is read-only.
 */

import { desc, eq, isNotNull } from "drizzle-orm";
import type { PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { customers } from "$lib/server/db/schema/customers.js";
import type {
  InvoicePdfStatus,
  InvoiceDriveStatus,
  InvoiceRow,
} from "$lib/domain/invoices.js";

export const load: PageServerLoad = async () => {
  const db = getDb();

  // Newest first
  const rows = await db
    .select({
      inv: invoices,
      customerName: customers.name,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .orderBy(desc(invoices.createdAt));

  // Build a lookup of supersedesId → newer invoice's business id so the row
  // can show "ersetzt durch FDW-2026-007".
  const supersedesRows = await db
    .select({
      id: invoices.id,
      businessId: invoices.businessId,
      supersedesId: invoices.supersedesId,
    })
    .from(invoices)
    .where(isNotNull(invoices.supersedesId));
  const supersededByMap = new Map<string, string>();
  for (const r of supersedesRows) {
    if (r.supersedesId) supersededByMap.set(r.supersedesId, r.businessId);
  }

  const items: InvoiceRow[] = rows.map(({ inv, customerName }) => ({
    id: inv.id,
    businessId: inv.businessId,
    rechnungsdatum: inv.rechnungsdatum,
    customerId: inv.customerId,
    customerName: customerName ?? inv.customerNameSnapshot,
    bezeichnung: inv.bezeichnung,
    nettoCents: Number(inv.nettoCents),
    bruttoCents: Number(inv.bruttoCents),
    currency: inv.currency,
    pdfStatus: inv.pdfStatus as InvoicePdfStatus,
    driveStatus: (inv.driveStatus ?? null) as InvoiceDriveStatus,
    drivePdfFileId: inv.drivePdfFileId ?? null,
    hasPdfBytes: inv.pdfBytes !== null && inv.pdfBytes !== undefined,
    festgeschriebenAt: inv.festgeschriebenAt
      ? inv.festgeschriebenAt.toISOString()
      : null,
    supersedesId: inv.supersedesId ?? null,
    supersededByBusinessId: supersededByMap.get(inv.id) ?? null,
    createdAt: inv.createdAt.toISOString(),
  }));

  return { invoices: items };
};
