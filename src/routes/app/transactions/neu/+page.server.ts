/**
 * /app/transactions/neu — Direct entry for Ausgabe / Einnahme / Spende.
 *
 * load(): zahlungsarten + members list for dropdowns.
 *
 * actions:
 *   ?/create — create expense | income | donation based on type picker.
 *              Redirects to /app/transactions/[id]?kind=<kind> on success.
 */

import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  createExpense,
  createIncome,
  createDonation,
  checkFestschreibungGate,
  listZahlungsarten,
} from "$lib/server/domain/transactions.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { asc } from "drizzle-orm";
import { logAudit } from "$lib/server/audit-log/index.js";

function berlinYear(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      year: "numeric",
    }).format(new Date()),
    10,
  );
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async () => {
  const db = getDb();

  const [zahlungsarten, allMembers] = await Promise.all([
    listZahlungsarten(),
    db
      .select({
        id: members.id,
        vorname: members.vorname,
        nachname: members.nachname,
        email: members.email,
        iban: members.iban,
      })
      .from(members)
      .orderBy(asc(members.nachname)),
  ]);

  return { zahlungsarten, members: allMembers };
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const baseSchema = z.object({
  type: z.enum(["expense", "income", "donation"]),
  bezeichnung: z.string().min(1).max(500),
  betragCents: z.coerce.number().int().positive(),
  currency: z.string().default("EUR"),
  kategorieNameSnapshot: z.string().max(200).default("(Unkategorisiert)"),
  sphereSnapshot: z
    .enum(["ideeller", "vermoegen", "zweckbetrieb", "wirtschaftlich"])
    .default("ideeller"),
  kommentar: z.string().max(2000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

const expenseSchema = baseSchema.extend({
  rechnungsdatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  bezahltVonKind: z.enum(["verein", "member", "extern"]).default("member"),
  bezahltVonMemberId: z.string().uuid().nullable().optional(),
  bezahltVonDisplay: z.string().max(200).default("(unbekannt)"),
  externName: z.string().max(200).nullable().optional(),
  externIban: z.string().max(50).nullable().optional(),
  externEmail: z.string().email().nullable().optional(),
});

const incomeSchema = baseSchema.extend({
  geldEingangDatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  rechnungsdatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

const donationSchema = baseSchema.extend({
  zugewendetAm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  memberId: z.string().uuid().nullable().optional(),
  spenderName: z.string().max(200).nullable().optional(),
  spenderEmail: z.string().email().nullable().optional(),
  spenderAdresse: z.string().max(500).nullable().optional(),
  spendeKind: z
    .enum(["geldspende", "sachspende", "aufwandsspende"])
    .default("geldspende"),
  zweckbindungKind: z.enum(["zweckfrei", "zweckgebunden"]).default("zweckfrei"),
  zweckbindungText: z.string().max(500).nullable().optional(),
});

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions = {
  create: async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const raw = Object.fromEntries(
      [...data.entries()].map(([k, v]) => [k, v === "" ? null : v]),
    );

    const typeRaw = raw.type as string;
    if (!["expense", "income", "donation"].includes(typeRaw)) {
      return fail(400, { error: "Ungültiger Typ" });
    }

    const year = berlinYear();

    try {
      if (typeRaw === "expense") {
        const parsed = expenseSchema.safeParse(raw);
        if (!parsed.success) {
          return fail(422, {
            error: "Ungültige Eingabe",
            issues: parsed.error.issues,
          });
        }

        const gate = await checkFestschreibungGate(year);
        if (!gate.ok) return fail(gate.status, { error: gate.error });

        const businessId = await allocateBusinessId("AUS", year);
        const result = await createExpense({
          ...parsed.data,
          businessId,
          actorUserId: user.id,
          bezahltVonDisplay:
            parsed.data.bezahltVonDisplay ||
            parsed.data.externName ||
            "Unbekannt",
        });

        await logAudit({
          action: "create",
          entityKind: "expense",
          entityId: result.id,
          entityBusinessId: result.businessId,
          actorUserId: user.id,
          actorKind: "user",
          payload: {
            bezeichnung: parsed.data.bezeichnung,
            betragCents: parsed.data.betragCents,
            source: "direct_entry",
          },
        });

        redirect(303, `/app/transactions/${result.id}?kind=expense`);
      }

      if (typeRaw === "income") {
        const parsed = incomeSchema.safeParse(raw);
        if (!parsed.success) {
          return fail(422, {
            error: "Ungültige Eingabe",
            issues: parsed.error.issues,
          });
        }

        const gate = await checkFestschreibungGate(year);
        if (!gate.ok) return fail(gate.status, { error: gate.error });

        const businessId = await allocateBusinessId("E", year);
        const result = await createIncome({
          ...parsed.data,
          businessId,
          actorUserId: user.id,
        });

        await logAudit({
          action: "create",
          entityKind: "income",
          entityId: result.id,
          entityBusinessId: result.businessId,
          actorUserId: user.id,
          actorKind: "user",
          payload: {
            bezeichnung: parsed.data.bezeichnung,
            betragCents: parsed.data.betragCents,
            source: "direct_entry",
          },
        });

        redirect(303, `/app/transactions/${result.id}?kind=income`);
      }

      if (typeRaw === "donation") {
        const parsed = donationSchema.safeParse(raw);
        if (!parsed.success) {
          return fail(422, {
            error: "Ungültige Eingabe",
            issues: parsed.error.issues,
          });
        }

        const gate = await checkFestschreibungGate(year);
        if (!gate.ok) return fail(gate.status, { error: gate.error });

        const businessId = await allocateBusinessId("S", year);
        const result = await createDonation({
          ...parsed.data,
          businessId,
          actorUserId: user.id,
        });

        await logAudit({
          action: "create",
          entityKind: "donation",
          entityId: result.id,
          entityBusinessId: result.businessId,
          actorUserId: user.id,
          actorKind: "user",
          payload: {
            bezeichnung: parsed.data.bezeichnung,
            betragCents: parsed.data.betragCents,
            spendeKind: parsed.data.spendeKind,
            source: "direct_entry",
          },
        });

        redirect(303, `/app/transactions/${result.id}?kind=donation`);
      }
    } catch (err) {
      // SvelteKit redirect throws — rethrow it
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        "location" in err
      ) {
        throw err;
      }
      console.error("[neu/create]", err);
      return fail(500, { error: "Interner Fehler beim Speichern" });
    }

    return fail(400, { error: "Unbekannter Typ" });
  },
} satisfies Actions;
