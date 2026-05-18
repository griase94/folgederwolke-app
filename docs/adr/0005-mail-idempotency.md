# ADR-0005: Mail idempotency with explicit re-send

**Status:** Accepted (Phase 1, applied)

## Context

We send transactional mail for: magic-link issuance (per sign-in attempt),
Auslage Eingangsbestätigung (on form submit), Auslage Erstattet (on Pay),
Spendenbescheinigung (on demand), Beitrags-Reminder (yearly), Invoice
versendet (on Send).

Naive `(template, entity_id)` UNIQUE constraints would prevent re-sends after
a bounce-fix or a manual "I lost it, please re-send" request.

## Decision

`sent_mails` has UNIQUE `(template, entity_kind, entity_id, send_attempt)`.

- A first send writes `send_attempt = 1`.
- Re-send increments to `2`, `3`, ...
- The bounce webhook (Phase 7.5) verifies an existing row's `provider_message_id`
  matches before incrementing — protects against the dup-on-retry race where
  two webhook deliveries (provider re-queue) both increment.

`template` is an enum (`mail_template`) covering the 7 v1 templates.
`entity_kind` is the parent entity discriminator (`expense`, `donation`, ...).
`entity_id` is the parent row's UUID; NULL for non-entity mails (admin pings).

## Manual re-send UI

A "Re-send Eingangsmail" button on Auslage detail is **deferred to Phase 2**.
v1 supports re-send via direct database `INSERT ... ON CONFLICT DO NOTHING`
with a manually incremented `send_attempt`.

## Consequences

- Mail-core (Phase 1, separate agent) checks the unique key inside a serializable
  transaction before sending. Pattern:
  `INSERT ... ON CONFLICT DO NOTHING RETURNING id` — if NULL, mail was already
  sent and we don't re-attempt.
- Mail provider chosen at runtime via `MAIL_PROVIDER` env (`smtp` default,
  `resend` planned for Phase 2).
