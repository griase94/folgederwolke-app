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
import { eq } from "drizzle-orm";
import type { Component } from "svelte";
import { getMailProvider } from "./provider.js";
import { renderMailTemplate } from "./render.js";
import type { EntityKind, TemplateProps, TemplateName } from "./types.js";

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
      throw new Error(`Template "${name}" is not implemented in Phase 1.`);
  }
}

// ---------------------------------------------------------------------------
// Subject lines
// ---------------------------------------------------------------------------

function subjectFor(
  name: TemplateName,
  props: Record<string, unknown>,
): string {
  switch (name) {
    case "magic_link":
      return "Dein Anmelde-Link für Folge der Wolke";
    case "auslage_eingang":
      return `Deine Auslage ${props.ausId ?? ""} ist bei uns angekommen`;
    case "auslage_erstattet":
      return `Deine Erstattung für ${props.ausId ?? ""} ist auf dem Weg`;
    case "auslage_abgelehnt":
      return `Zu deiner Auslage ${props.ausId ?? ""}`;
    case "beitrag_reminder":
      return `Erinnerung: dein Mitgliedsbeitrag ${props.jahr ?? ""} ist noch offen`;
    case "spende_bescheinigung":
      return "Deine Aufwandsspenden-Bestätigung von Folge der Wolke e.V.";
    default:
      return "Nachricht von Folge der Wolke e.V.";
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
}): Promise<{ messageId: string | null; deduped: boolean }> {
  const {
    template,
    entity_kind,
    entity_id,
    to,
    props,
    send_attempt = 1,
  } = opts;

  const db = getDb();
  const subject = subjectFor(template, props as Record<string, unknown>);

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
    props as Record<string, unknown>,
  );

  // ── 3. Send ────────────────────────────────────────────────────────────────
  const provider = await getMailProvider();

  try {
    const result = await provider.send({
      from: env.MAIL_FROM || "noreply@folgederwolke.de",
      to,
      subject,
      html,
      text,
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
