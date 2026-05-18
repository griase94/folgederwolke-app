/**
 * /auslage-einreichen — public Auslage submission form.
 *
 * load()   → returns initial empty form state (PUBLIC_FORM_ENABLED gate).
 * actions  → validates, allocates AUS-ID, inserts DB row, uploads Beleg to
 *            Drive, sends EingangsMail, writes audit log, redirects.
 *
 * PUBLIC_FORM_ENABLED=false → 404 on both load and action.
 */

import { error, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { auditLog } from "$lib/server/db/schema/audit_log.js";
import { env } from "$lib/server/env.js";
import {
  validateAuslageInput,
  composeBezahltVonDisplay,
} from "$lib/server/domain/auslagen.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { uploadBeleg } from "$lib/server/drive/index.js";
import { sendMail } from "$lib/server/mail/index.js";

// ---------------------------------------------------------------------------
// Dependency injection seam for tests
// ---------------------------------------------------------------------------

/** Overrideable uploadBeleg — swapped out in tests via _setUploadBelegFn(). */
export let _uploadBelegFn: typeof uploadBeleg = uploadBeleg;
export function _setUploadBelegFn(fn: typeof uploadBeleg) {
  _uploadBelegFn = fn;
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async () => {
  if (!env.PUBLIC_FORM_ENABLED) {
    throw error(404, "Das Formular ist momentan nicht verfügbar.");
  }
  return { formEnabled: true };
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function ipPrefix(ip: string): string {
  if (ip.includes(":")) {
    return ip.split(":")[0] ?? ip.slice(0, 8);
  }
  const parts = ip.split(".");
  return parts.slice(0, 2).join(".");
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  default: async ({ request, getClientAddress }) => {
    // ── Gate ──────────────────────────────────────────────────────────────────
    if (!env.PUBLIC_FORM_ENABLED) {
      throw error(404, "Das Formular ist momentan nicht verfügbar.");
    }

    // ── 1. Parse FormData ─────────────────────────────────────────────────────
    const formData = await request.formData();
    const jsonRaw = formData.get("data");
    const belegFile = formData.get("beleg");

    if (typeof jsonRaw !== "string") {
      throw error(400, "Ungültige Anfrage: fehlendes Datenfeld.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch {
      throw error(400, "Ungültige Anfrage: JSON konnte nicht geparst werden.");
    }

    if (belegFile instanceof File && belegFile.size > 0) {
      (parsed as Record<string, unknown>).beleg_name = belegFile.name;
      (parsed as Record<string, unknown>).beleg_mime_type = belegFile.type;
    }

    // ── 2. Server-side validation ─────────────────────────────────────────────
    const validation = validateAuslageInput(parsed);
    if (!validation.ok) {
      throw error(422, JSON.stringify({ errors: validation.errors }));
    }

    const input = validation.data;
    const bv = input.bezahlt_von;

    // ── 3. Allocate business ID ───────────────────────────────────────────────
    const year = new Date().getFullYear();
    const ausId = await allocateBusinessId("AUS", year);

    // ── 4. Insert DB row ──────────────────────────────────────────────────────
    const db = getDb();
    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";

    const [insertedRow] = await db
      .insert(auslagenSubmissions)
      .values({
        businessId: ausId,
        bezeichnung: input.bezeichnung,
        kommentar: input.kommentar ?? null,
        rechnungsdatum: input.rechnungsdatum ?? null,
        betragCents: BigInt(input.betragCents),
        currency: input.currency,
        wofuer: input.wofuer ?? null,
        bezahltVonKind: bv.kind,
        bezahltVonMemberId: bv.kind === "member" ? bv.member_id : null,
        externName: bv.kind === "extern" ? bv.name : null,
        externIban: bv.kind === "extern" ? bv.iban : null,
        externEmail: bv.kind === "extern" ? bv.email : null,
        bezahltVonDisplay: composeBezahltVonDisplay(bv),
        submitterIpPrefix: ipPrefix(ip),
        submitterUaHash: hashString(ua),
      })
      .returning({ id: auslagenSubmissions.id });

    if (!insertedRow) {
      throw error(500, "Fehler beim Speichern der Einreichung.");
    }

    const submissionId = insertedRow.id;

    // ── 5. Upload Beleg to Drive ───────────────────────────────────────────────
    if (belegFile instanceof File && belegFile.size > 0) {
      try {
        const buffer = Buffer.from(await belegFile.arrayBuffer());
        const mimeType = belegFile.type || "application/octet-stream";
        const fileName = belegFile.name || "beleg";

        const { driveFileId } = await _uploadBelegFn({
          buffer,
          mimeType,
          name: `${ausId}_${fileName}`,
          idempotencyKey: `${ausId}:${submissionId}`,
        });

        await db
          .update(auslagenSubmissions)
          .set({ belegDriveFileId: driveFileId, belegOriginalName: fileName })
          .where(eq(auslagenSubmissions.id, submissionId));
      } catch (driveErr) {
        console.error(
          `[auslage-einreichen] Drive upload failed for ${ausId}:`,
          driveErr,
        );
        // Best-effort cleanup: delete the orphaned DB row.
        try {
          await db
            .delete(auslagenSubmissions)
            .where(eq(auslagenSubmissions.id, submissionId));
        } catch (cleanupErr) {
          console.error(
            "[auslage-einreichen] DB cleanup after Drive failure also failed:",
            cleanupErr,
          );
        }
        throw error(
          502,
          "Beleg-Upload fehlgeschlagen. Bitte erneut versuchen.",
        );
      }
    }

    // ── 6. Send EingangsMail (best-effort) ────────────────────────────────────
    const recipientEmail =
      bv.kind === "extern"
        ? bv.email
        : bv.kind === "member"
          ? (bv.email ?? null)
          : null;

    if (recipientEmail) {
      const vorname =
        bv.kind === "member"
          ? (bv.display_name.split(" ")[0] ?? bv.display_name)
          : bv.kind === "extern"
            ? (bv.name.split(" ")[0] ?? bv.name)
            : "Mitglied";

      try {
        await sendMail({
          template: "auslage_eingang",
          entity_kind: "auslagen_submission",
          entity_id: submissionId,
          to: recipientEmail,
          props: {
            vorname,
            ausId,
            bezeichnung: input.bezeichnung,
            betragCents: input.betragCents,
            eingereichtAm: new Date(),
          },
        });
      } catch (mailErr) {
        console.error(
          `[auslage-einreichen] EingangsMail failed for ${ausId}:`,
          mailErr,
        );
      }
    }

    // ── 7. Audit log ──────────────────────────────────────────────────────────
    try {
      await db.insert(auditLog).values({
        actorKind: "system",
        action: "create",
        entityKind: "auslagen_submission",
        entityId: submissionId,
        entityBusinessId: ausId,
        actorIpPrefix: ipPrefix(ip),
        actorUaHash: hashString(ua),
        payload: {
          bezeichnung: input.bezeichnung,
          betragCents: input.betragCents,
          bezahltVonKind: bv.kind,
        },
      });
    } catch (auditErr) {
      console.error("[auslage-einreichen] Audit log insert failed:", auditErr);
    }

    // ── 8. Redirect ───────────────────────────────────────────────────────────
    throw redirect(303, `/auslage-eingereicht?id=${encodeURIComponent(ausId)}`);
  },
};
