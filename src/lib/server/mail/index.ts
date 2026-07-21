/**
 * Public mail API — sendMail().
 *
 * Idempotency via sent_mails UNIQUE(template, entity_kind, entity_id, send_attempt).
 * On conflict (already sent): returns { deduped: true } without sending.
 * On provider failure: marks failedAt in the DB row and re-throws.
 *
 * ADR-0005: Re-send increments send_attempt (caller responsibility).
 */

import { getDb } from "$lib/server/db/index.js";
import { sentMails } from "$lib/server/db/schema/mails.js";
import { env } from "$lib/server/env.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";
import { addressOneLine } from "$lib/server/domain/address.js";
import { eq } from "drizzle-orm";
import type { Component } from "svelte";
import { getMailProvider } from "./provider.js";
import { renderMailTemplate } from "./render.js";
import type {
  EntityKind,
  MailAttachment,
  TemplateProps,
  TemplateName,
} from "./types.js";

// ---------------------------------------------------------------------------
// Template component registry
// ---------------------------------------------------------------------------

async function loadTemplate(name: TemplateName) {
  switch (name) {
    case "magic_link":
      return (await import("./templates/MagicLink.svelte")).default;
    case "auslage_eingang":
      return (await import("./templates/EingangsMail.svelte")).default;
    case "auslage_erstattet":
      return (await import("./templates/ErstattungsMail.svelte")).default;
    case "beitrag_reminder":
      return (await import("./templates/BeitragsReminder.svelte")).default;
    case "spende_bescheinigung":
      return (await import("./templates/AufwandsspendenBestaetigung.svelte"))
        .default;
    case "auslage_abgelehnt":
      return (await import("./templates/RejectionMail.svelte")).default;
    case "invoice_versendet":
      return (await import("./templates/InvoiceVersendetMail.svelte")).default;
    case "auslage_approved":
      return (await import("./templates/ApprovalMail.svelte")).default;
  }
}

// ---------------------------------------------------------------------------
// Subject lines
// ---------------------------------------------------------------------------

export function subjectFor(
  name: TemplateName,
  props: Record<string, unknown>,
): string {
  // Runtime Verein name (injected by sendMail from readStammdaten); never a
  // hardcoded "Folge der Wolke" literal (white-label Phase 1, Task 2.2).
  const vereinName =
    typeof props.vereinName === "string" && props.vereinName.trim() !== ""
      ? props.vereinName
      : "Verein";
  switch (name) {
    case "magic_link":
      return `Dein Anmelde-Link für ${vereinName}`;
    case "auslage_eingang":
      return `Deine Auslage ${props.ausId ?? ""} ist bei uns angekommen`;
    case "auslage_erstattet":
      return `Deine Erstattung für ${props.ausId ?? ""} ist auf dem Weg`;
    case "auslage_abgelehnt":
      return `Zu deiner Auslage ${props.ausId ?? ""}`;
    case "beitrag_reminder":
      return `Erinnerung: dein Mitgliedsbeitrag ${props.jahr ?? ""} ist noch offen`;
    case "spende_bescheinigung":
      return `Deine Aufwandsspenden-Bestätigung von ${vereinName}`;
    case "invoice_versendet":
      return `Rechnung ${props.invoiceNumber ?? ""} von ${vereinName}`;
    case "auslage_approved":
      return `${props.ausId ?? ""} genehmigt – ${vereinName}`;
    default:
      return `Nachricht von ${vereinName}`;
  }
}

// ---------------------------------------------------------------------------
// sendMail
// ---------------------------------------------------------------------------

export async function sendMail<T extends TemplateName>(opts: {
  template: T;
  entity_kind: EntityKind;
  entity_id: string | null;
  to: string;
  props: TemplateProps[T];
  send_attempt?: number;
  /** Optional file attachments (E3a — the invoice PDF). Never persisted. */
  attachments?: MailAttachment[];
}): Promise<{ messageId: string | null; deduped: boolean }> {
  const {
    template,
    entity_kind,
    entity_id,
    to,
    props,
    send_attempt = 1,
    attachments,
  } = opts;

  const db = getDb();

  // ── Inject runtime Verein identity into every template's props ─────────────
  // Sourced once from readStammdaten() (settings → env fallback). The shared
  // MailFooter + the subjects + body wordmarks all render from these props,
  // never a hardcoded "Folge der Wolke" literal (white-label Phase 1, Task 2.2).
  // baseUrl threads PUBLIC_BASE_URL so EingangsMail can build an absolute
  // status link (Task 2.3).
  const sd = await readStammdaten();
  const mergedProps = {
    ...(props as unknown as Record<string, unknown>),
    vereinName: sd.name,
    // Compact one-line form for the inline mail footer (the multi-line postal
    // address — incl. any c/o — would otherwise collapse to run-on text in HTML).
    adresse: addressOneLine(sd.adresse),
    vr: sd.vr,
    steuernummer: sd.steuernummer,
    stammdaten: sd,
    baseUrl: env.PUBLIC_BASE_URL,
  } as Record<string, unknown>;

  const subject = subjectFor(template, mergedProps);

  // ── 1. Idempotency insert ──────────────────────────────────────────────────
  const inserted = await db
    .insert(sentMails)
    .values({
      template,
      entityKind: entity_kind,
      entityId: entity_id ?? undefined,
      sendAttempt: send_attempt,
      toCanonical: to.toLowerCase().trim(),
      toDisplay: to,
      subject,
      status: "queued",
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    // Row already exists → already sent (or in-flight); skip.
    return { messageId: null, deduped: true };
  }

  // inserted.length > 0 guaranteed by the early-return above.
  const row = inserted[0]!;

  // ── 2. Render ──────────────────────────────────────────────────────────────
  const component = await loadTemplate(template);
  // Each Svelte component has stricter typed props than Component<{}>; cast via
  // unknown to satisfy renderMailTemplate's loose signature without losing safety.
  const { html, text } = renderMailTemplate(
    component as unknown as Component,
    mergedProps,
  );

  // ── 3. Send ────────────────────────────────────────────────────────────────
  const provider = await getMailProvider();

  try {
    const result = await provider.send({
      from: env.MAIL_FROM,
      to,
      subject,
      html,
      text,
      attachments,
    });

    // ── 4. Mark sent ──────────────────────────────────────────────────────────
    await db
      .update(sentMails)
      .set({
        status: "sent",
        providerMessageId: result.messageId,
        sentAt: new Date(),
      })
      .where(eq(sentMails.id, row.id));

    return { messageId: result.messageId, deduped: false };
  } catch (err) {
    // ── 5. Mark failed (keep row for dedup / audit) ────────────────────────
    await db
      .update(sentMails)
      .set({
        status: "failed",
        failedAt: new Date(),
        providerResponse: { error: String(err) },
      })
      .where(eq(sentMails.id, row.id));

    throw err;
  }
}
