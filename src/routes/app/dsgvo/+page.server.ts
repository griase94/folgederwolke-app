/**
 * /app/dsgvo — DSGVO admin panel.
 *
 * actions:
 *   ?/auskunft   — collect all data for email, render PDF, return as download
 *   ?/pseudonymise — redact PII (§147 AO retention-aware); hard-delete auth rows
 *
 * Both actions require the admin to be authenticated (enforced by
 * hooks.server.ts + /app layout). All operations are audit-logged.
 */

import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import { collectAuskunft, pseudonymise } from "$lib/server/domain/dsgvo.js";
import { renderAuskunftPdf } from "$lib/server/pdf/auskunft.js";

export const load: PageServerLoad = async () => {
  // No data to preload — form is fully server-action driven
  return {};
};

export const actions: Actions = {
  // ── Auskunft — generate PDF with all data for the given email ─────────────
  auskunft: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    void userId; // logged inside collectAuskunft via audit

    const formData = await request.formData();
    const email = formData.get("email")?.toString().trim() ?? "";

    if (!email || !email.includes("@")) {
      return fail(400, {
        action: "auskunft",
        error: "Bitte eine gültige E-Mail-Adresse eingeben.",
      });
    }

    const data = await collectAuskunft(email);
    const pdf = await renderAuskunftPdf(data);

    // Encode as base64 so it can be passed through SvelteKit's JSON serialisation
    const base64 =
      typeof Buffer !== "undefined"
        ? Buffer.from(pdf.bytes).toString("base64")
        : btoa(String.fromCharCode(...pdf.bytes));

    return {
      action: "auskunft",
      success: true,
      filename: pdf.suggestedFilename,
      pdfBase64: base64,
      summary: {
        email,
        members: data.members.length,
        donations: data.donations.length,
        auslagenSubmissions: data.auslagenSubmissions.length,
        sentMails: data.sentMails.length,
        auditLogEntries: data.auditLogEntries.length,
      },
    };
  },

  // ── Pseudonymise — redact PII, hard-delete auth rows ─────────────────────
  pseudonymise: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;

    const formData = await request.formData();
    const email = formData.get("email")?.toString().trim() ?? "";
    const confirm = formData.get("confirm")?.toString().trim() ?? "";

    if (!email || !email.includes("@")) {
      return fail(400, {
        action: "pseudonymise",
        error: "Bitte eine gültige E-Mail-Adresse eingeben.",
      });
    }

    if (confirm !== email) {
      return fail(400, {
        action: "pseudonymise",
        error:
          "Bestätigungs-E-Mail stimmt nicht überein. Bitte die E-Mail-Adresse zur Bestätigung erneut eingeben.",
      });
    }

    const result = await pseudonymise(email, userId);

    return {
      action: "pseudonymise",
      success: true,
      email,
      result,
    };
  },
};
