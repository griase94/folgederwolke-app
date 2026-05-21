/**
 * /app/transactions/neu — Direct entry for Ausgabe / Einnahme / Spende.
 *
 * load(): zahlungsarten + members list + Kategorie options (expense/income)
 *         + smart-default Kategorie names per kind. The Kategorie picker
 *         drives sphereSnapshot — fixes VB-004 (vereinsbuchhalter) +
 *         JB-014 (julia-buchhaltung) tax-correctness bug where the form
 *         hardcoded sphereSnapshot="ideeller" and kategorieNameSnapshot=
 *         "(Unkategorisiert)" for every booking.
 *
 * actions:
 *   ?/create — create expense | income | donation based on type picker.
 *              Sphere is re-resolved server-side from the picked Kategorie
 *              (resolveSphereForKategorie) so a tampered body cannot
 *              mis-classify the booking. Redirects to
 *              /app/transactions/[id]?kind=<kind> on success.
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
import {
  listKategorieOptions,
  loadRecentKategorieUsage,
  pickDefaultKategorieName,
  resolveSphereForKategorie,
} from "$lib/server/domain/transaction-pickers.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { asc, eq } from "drizzle-orm";
import { parseKindFromUrl } from "$lib/domain/transaction-kind-url.js";
import { handleAuslageUpload } from "$lib/server/files/handleAuslageUpload.js";

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

export const load: PageServerLoad = async ({ locals, url }) => {
  const db = getDb();
  const userId = locals.session?.user?.id ?? null;

  // C7-1 — the FabBottomSheet emits German URL slugs
  //   /app/transactions/neu?kind=ausgabe|einnahme|spende
  // Domain enum is English. parseKindFromUrl maps both directions and
  // returns null on missing/bogus input. Form defaults to "expense" so
  // a fresh /app/transactions/neu (no query) lands on Ausgabe — preserves
  // the cycle-1 default.
  const initialType: "expense" | "income" | "donation" =
    parseKindFromUrl(url.searchParams.get("kind")) ?? "expense";

  const [
    zahlungsarten,
    allMembers,
    expenseKategorien,
    incomeKategorien,
    recent,
  ] = await Promise.all([
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
    listKategorieOptions("expense"),
    listKategorieOptions("income"),
    userId ? loadRecentKategorieUsage(userId) : Promise.resolve([]),
  ]);

  // Pre-compute the no-project default for each kind so the form lands on a
  // sensible pick without an extra round-trip (last-used > sortOrder fallback).
  const defaultExpenseKategorie = pickDefaultKategorieName({
    kategorien: expenseKategorien,
    recent,
    projectId: null,
    kind: "expense",
  });
  const defaultIncomeKategorie = pickDefaultKategorieName({
    kategorien: incomeKategorien,
    recent,
    projectId: null,
    kind: "income",
  });

  return {
    zahlungsarten,
    members: allMembers,
    expenseKategorien,
    incomeKategorien,
    defaultExpenseKategorie,
    defaultIncomeKategorie,
    initialType,
  };
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const sphereValues = [
  "ideeller",
  "vermoegen",
  "zweckbetrieb",
  "wirtschaftlich",
] as const;

const baseSchema = z.object({
  type: z.enum(["expense", "income", "donation"]),
  bezeichnung: z.string().min(1).max(500),
  betragCents: z.coerce.number().int().positive(),
  currency: z.string().default("EUR"),
  // Required for expense + income — the picker now drives this.
  // Donations override with the donation-specific schema below (kept as
  // "Spende" snapshot for legacy parity).
  kategorieNameSnapshot: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => v !== "(Unkategorisiert)", {
      message:
        "Kategorie muss ausgewählt werden (VB-004/JB-014 tax-correctness gate)",
    }),
  sphereSnapshot: z.enum(sphereValues),
  kommentar: z.string().max(2000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
});

const expenseSchema = baseSchema.extend({
  // C2-TAX: required (was optional) — EÜR §11 EStG requires the invoice
  // date for every expense.
  rechnungsdatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Rechnungsdatum erforderlich (YYYY-MM-DD)"),
  // C2-TAX: newly required — distinct from Rechnungsdatum. The cash-out date
  // is what drives Buchungsjahr-Zuordnung for EÜR.
  geldfluss_datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Geldfluss-Datum erforderlich (YYYY-MM-DD)"),
  // C2-TAX: default flips 'member' → 'verein' for the admin direct path
  // (the admin almost always enters Verein-paid expenses; Mitglied entries
  // come via the public Auslage form).
  bezahltVonKind: z.enum(["verein", "member", "extern"]).default("verein"),
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

// Donations carry their own snapshot ("Spende") and sphere; the picker is not
// applied to them in this cluster (donation categorization is its own UX track).
const donationSchema = baseSchema.extend({
  kategorieNameSnapshot: z.string().min(1).max(200).default("Spende"),
  sphereSnapshot: z.enum(sphereValues).default("ideeller"),
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

        // C2-TAX: a Beleg is now required for kind=ausgabe on the admin
        // direct path (tax-correctness gate — EÜR §11 EStG). Mirror the
        // public-form check.
        const belegFormField = data.get("beleg");
        if (!(belegFormField instanceof File) || belegFormField.size === 0) {
          return fail(400, {
            error: "Beleg-Datei ist erforderlich für Ausgaben.",
            errors: { beleg: ["Beleg-Datei ist erforderlich."] },
          });
        }

        // Sphere is server-truth: re-derive from the picked kategorie so a
        // tampered form body cannot mis-classify the booking. When a project
        // is attached, its `sphereDefault` overrides the kategorie default
        // (ADR-0008) — mirrors the canonical pattern in invoices.ts:234-243.
        const expenseKategorien = await listKategorieOptions("expense");
        const db = getDb();
        const project = parsed.data.projectId
          ? ((
              await db
                .select({ sphereDefault: projects.sphereDefault })
                .from(projects)
                .where(eq(projects.id, parsed.data.projectId))
                .limit(1)
            )[0] ?? null)
          : null;
        const sphereSnapshot = resolveSphereForKategorie({
          kategorien: expenseKategorien,
          kategorieName: parsed.data.kategorieNameSnapshot,
          projectSphereOverride: project?.sphereDefault ?? null,
        });

        const gate = await checkFestschreibungGate(year);
        if (!gate.ok) return fail(gate.status, { error: gate.error });

        // C2-TAX: upload Beleg via the generalized helper. sourceKind='app'
        // routes the actor identity to files.uploaded_by_user_id per ADR-0010.
        let belegFileId: string;
        try {
          const uploadResult = await handleAuslageUpload(belegFormField, {
            actorUserId: user.id,
            sourceKind: "app",
          });
          belegFileId = uploadResult.fileId;
        } catch (uploadErr) {
          console.error("[neu/create] beleg upload failed:", uploadErr);
          const msg =
            uploadErr instanceof Error
              ? uploadErr.message
              : "Beleg konnte nicht hochgeladen werden.";
          return fail(422, {
            error: msg,
            errors: { beleg: [msg] },
          });
        }

        // `A-` prefix for direct app entries. `AUS-` is reserved for form
        // submissions (carries over via the inbox approve flow). See ADR-0010.
        const businessId = await allocateBusinessId("A", year);
        const result = await createExpense({
          ...parsed.data,
          // C2-TAX: persist Geldfluss-Datum (form field is snake_case; the
          // domain layer uses camelCase per Drizzle convention).
          geldflussDatum: parsed.data.geldfluss_datum,
          belegFileId,
          sphereSnapshot,
          businessId,
          actorUserId: user.id,
          bezahltVonDisplay:
            parsed.data.bezahltVonDisplay ||
            parsed.data.externName ||
            "Unbekannt",
        });
        // Audit log: createExpense emits `expense.created`, the handler
        // writes the audit_log row (ADR-0004 — no inline logAudit).

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

        const incomeKategorien = await listKategorieOptions("income");
        const db = getDb();
        const project = parsed.data.projectId
          ? ((
              await db
                .select({ sphereDefault: projects.sphereDefault })
                .from(projects)
                .where(eq(projects.id, parsed.data.projectId))
                .limit(1)
            )[0] ?? null)
          : null;
        const sphereSnapshot = resolveSphereForKategorie({
          kategorien: incomeKategorien,
          kategorieName: parsed.data.kategorieNameSnapshot,
          projectSphereOverride: project?.sphereDefault ?? null,
        });

        const gate = await checkFestschreibungGate(year);
        if (!gate.ok) return fail(gate.status, { error: gate.error });

        const businessId = await allocateBusinessId("E", year);
        const result = await createIncome({
          ...parsed.data,
          sphereSnapshot,
          businessId,
          actorUserId: user.id,
        });
        // Audit log: createIncome emits `income.created` (handler writes
        // the audit_log row).

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

        // C2-TAX: derive kategorieNameSnapshot from the selected Kategorie
        // (was hardcoded to 'Spende'). When the user picks a real kategorie
        // we want the snapshot to match — the form sends `kategorieId` and
        // we look up the live name; falls back to the form-supplied snapshot
        // (or the schema default 'Spende') when no kategorie was picked.
        let kategorieNameSnapshot = parsed.data.kategorieNameSnapshot;
        if (raw.kategorieId && typeof raw.kategorieId === "string") {
          const incomeKategorien = await listKategorieOptions("income");
          const selected = incomeKategorien.find(
            (k) => k.id === raw.kategorieId,
          );
          if (selected) {
            kategorieNameSnapshot = selected.name;
          }
        }

        const businessId = await allocateBusinessId("S", year);
        const result = await createDonation({
          ...parsed.data,
          kategorieNameSnapshot,
          businessId,
          actorUserId: user.id,
        });
        // Audit log: createDonation emits `donation.created` (handler
        // writes the audit_log row).

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
