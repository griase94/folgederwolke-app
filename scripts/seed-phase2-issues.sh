#!/usr/bin/env bash
# seed-phase2-issues.sh — Create the 19 Phase 2 backlog issues on GitHub.
#
# Idempotent: checks existing issues via `gh issue list` before creating.
# Source: docs/phase2-backlog.md + masterplan §15.
#
# Usage:
#   ./scripts/seed-phase2-issues.sh
#
# Prerequisites:
#   - gh CLI authenticated (gh auth status)
#   - label "phase-2" exists on the repo (created automatically below)

set -euo pipefail

REPO="griase94/folgederwolke-app"
LABEL="phase-2"

log()  { echo "[seed-phase2] $*"; }
skip() { echo "[seed-phase2] SKIP (already exists): $1"; }

# ── Ensure label exists ───────────────────────────────────────────────────────
if ! gh label list --repo "${REPO}" | grep -q "^${LABEL}"; then
  log "Creating label '${LABEL}'..."
  gh label create "${LABEL}" \
    --repo "${REPO}" \
    --color "0075ca" \
    --description "Phase 2 backlog — intentional v1 deferrals" || true
fi

# ── Helper: create issue only if title not already present ───────────────────
create_issue() {
  local title="$1"
  local body="$2"

  if gh issue list --repo "${REPO}" --label "${LABEL}" --state all \
       --json title --jq '.[].title' 2>/dev/null | grep -qF "${title}"; then
    skip "${title}"
    return
  fi

  gh issue create \
    --repo "${REPO}" \
    --label "${LABEL}" \
    --title "${title}" \
    --body "${body}"
  log "Created: ${title}"
}

# ── Issue 1 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(public-form): photo-first capture with Claude Haiku OCR pre-fill" \
  "## Source
Masterplan §15 / D8 round-1 UX. Effort: M (4–6h).

## Motivation
> \"Photo-first capture\" was the top UX request in D8 round-1: users want to snap a receipt and have the amount + description pre-filled rather than typing.

## What to build
- Add a camera/file-capture step at the top of \`/form\` that sends the image to Claude Haiku (vision) for OCR extraction of: Betrag, Datum, Händler/Beschreibung.
- Pre-fill the form fields with extracted values; user reviews and confirms before submit.
- Graceful fallback: if OCR fails or returns low confidence, show empty fields as today.

## Data-model implications
- No schema changes required — extracted values map to existing \`auslagen_submissions\` columns.
- Add \`ocr_confidence\` nullable float column to \`auslagen_submissions\` for audit trail (optional, Phase 2 decision).
- Source remains \`source='form'\`.

## Suggested UX
1. User taps \"Beleg fotografieren\" button → native camera / file picker opens.
2. Photo displayed as thumbnail; spinner shows \"Wird erkannt…\".
3. Fields slide in pre-filled; yellow highlight indicates AI-filled values.
4. User edits if needed, submits normally.

## Definition of Done
- [ ] Photo capture works on iOS Safari + Android Chrome
- [ ] Haiku OCR extracts Betrag and Datum from ≥ 80% of German receipts in test set
- [ ] Pre-filled values are editable (not locked)
- [ ] Graceful fallback on OCR failure
- [ ] Unit test for OCR extraction service
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 2 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(admin): Cmd-K palette with federated entity search" \
  "## Source
Masterplan §15 / D8 round-1 UX. Effort: M (3–5h).

## Motivation
> Kassenwart requested a keyboard-first power-user shortcut to navigate to any expense, member, or invoice without using the sidebar nav.

## What to build
- Global \`Cmd+K\` / \`Ctrl+K\` command palette (all \`/app/*\` routes).
- Federated search across: expenses (by business_id, Bezeichnung), members (by name/email), invoices (by number), income rows.
- Recent items section (last 10 visited, stored in sessionStorage).
- Keyboard-only navigation (arrow keys + Enter).

## Data-model implications
- No schema changes — queries existing tables via full-text or ILIKE.
- Add \`v_search\` view or use existing indexed columns for performance.
- Consider \`pg_trgm\` extension on Neon for fuzzy matching.

## Suggested UX
- \`cmdk\` library (React/Svelte port) or custom Svelte implementation.
- Results grouped by type: Ausgaben / Mitglieder / Rechnungen.
- Keyboard shortcut shown in sidebar as a hint for discoverability.

## Definition of Done
- [ ] Opens on Cmd+K, closes on Esc
- [ ] Returns results within 200ms for typical dataset sizes
- [ ] Works in all major admin sections
- [ ] Accessible (ARIA combobox pattern)
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 3 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(invoice): live PDF preview instead of separate Generieren button" \
  "## Source
Masterplan §15 / D8 round-4 UX. Effort: L (6–8h).

## Motivation
> Current flow: fill invoice form → click \"Generieren\" → wait for async job → download PDF. D8 round-4 feedback: users want to see what the PDF looks like before committing.

## What to build
- Side-by-side or bottom panel live HTML preview of the invoice as the user types (no async job for preview).
- \"Als PDF speichern\" button triggers the existing async \`invoice_jobs\` pipeline only when user is satisfied.
- Preview renders the same data as the Docs-template merge but as HTML (no Google API call needed).

## Data-model implications
- \`invoice_jobs\` table and \`pdf_status\` enum unchanged.
- New: \`GET /app/rechnungen/:id/preview\` server route returning HTML fragment.

## Suggested UX
- Two-column layout on desktop: form left, preview right (updates on blur/debounce).
- Mobile: tabbed (Formular / Vorschau).
- Preview clearly watermarked \"VORSCHAU\" so it cannot be mistaken for the final PDF.

## Definition of Done
- [ ] Preview updates within 500ms of field change (debounced)
- [ ] Preview output is visually identical to final PDF for all template fields
- [ ] Watermark clearly visible
- [ ] Existing async PDF generation pipeline unchanged
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 4 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(treasurer): weekly Monday-morning digest mail" \
  "## Source
Masterplan §15 / D8 round-1 UX. Effort: S (2–3h).

## Motivation
> Kassenwart requested a weekly summary email on Monday morning covering open items requiring action, so they don't have to log in to check status.

## What to build
- New mail template \`treasurer_digest\` (add to \`mail_template\` enum).
- Vercel Cron: Monday 07:00 Europe/Berlin → send digest to all \`admin\` users.
- Digest content: count of expenses \`zu_pruefen\`, count \`geprueft\` (awaiting payment), open Mitgliedsbeiträge for current year, any invoice jobs \`failed\`.

## Data-model implications
- Add \`mail_template\` enum value: \`treasurer_digest\`.
- Cron handler in \`src/routes/api/cron/digest/+server.ts\`.
- Idempotent via \`sent_mails\` (ADR-0005): \`UNIQUE(template, entity_kind, entity_id, send_attempt)\` — use ISO week as entity_id.

## Suggested UX
- Plain-text + HTML email.
- Each section has a direct link to the relevant admin page.
- \"Nichts zu tun\" variant if all counts are 0 (still sent, as a heartbeat).

## Definition of Done
- [ ] Cron fires Monday 07:00 Berlin time (check DST handling via \`year_for_booking\` pattern)
- [ ] Mail idempotent (second run same week = no duplicate)
- [ ] All three admins receive mail in test
- [ ] Unit test for digest data aggregation
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 5 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(public-form): multi-receipt batch flow for event expenses" \
  "## Source
Masterplan §15 / D8 round-1 UX. Effort: M (4–5h).

## Motivation
> \"Just got back from an event with 4 receipts\" — the most common real-world use case involves multiple small receipts from a single event. Current form requires one submission per receipt, causing friction.

## What to build
- \"Weitere Belege hinzufügen\" button in the public form that adds a second (and third…) receipt upload + Betrag field to the same submission.
- Each individual item stored as a separate \`auslagen_submissions\` row (atomic, GoBD-clean), but grouped by a shared \`batch_id\`.
- Eingangsmail lists all items in the batch as a summary.

## Data-model implications
- Add \`batch_id uuid\` nullable column to \`auslagen_submissions\`.
- Add partial index on \`batch_id WHERE batch_id IS NOT NULL\`.
- No changes to \`expenses\` table — each submission converts to its own expense row.

## Suggested UX
- Accordion UI: each receipt in its own collapsible panel.
- \"+ Weiteren Beleg hinzufügen\" button below last panel (max 10 per batch).
- Summary line at bottom: \"Gesamt: X Belege, €YY,YY\".
- Single submit button for the whole batch.

## Definition of Done
- [ ] Each item gets its own \`auslagen_submissions\` row with shared \`batch_id\`
- [ ] Eingangsmail summarises all items in batch
- [ ] Admin inbox groups batch items visually
- [ ] Max 10 items per batch enforced client + server side
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 6 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(admin): auto-approve small-amount expenses from trusted members" \
  "## Source
Masterplan §15 / D8 — gated on Vereinsordnung review. Effort: S (2–3h).

## Motivation
> Kassenwart spends significant time approving routine small expenses (coffee, printing, stamps). Auto-approval for trusted members below a threshold would free up review time for larger items.

## What to build
- New settings key: \`auto_approve.trusted_member_threshold_cents\` (default: disabled / 0).
- When a new \`auslagen_submissions\` row arrives from a \`member\` (not extern), if \`betrag_cents ≤ threshold\` AND submitter is in \`trusted_members\` list: auto-approve and create \`expense\` with \`status=geprueft\`.
- Audit-log entry: \`action=approve, actor_kind=system, payload={reason: \"auto_approve_threshold\"}\`.

## Data-model implications
- New settings keys: \`auto_approve.threshold_cents\`, \`auto_approve.trusted_member_ids\` (array).
- No schema changes to \`expenses\` — \`approved_by_user_id\` left null for system approvals; \`actor_kind=system\` in audit log.

## Legal gate
- **Must NOT enable without Vereinsordnung review** confirming auto-approval is permissible under the Verein's financial governance rules.
- Feature flag: \`AUTO_APPROVE_ENABLED=false\` default.

## Definition of Done
- [ ] Disabled by default; requires explicit opt-in in Einstellungen
- [ ] Threshold + trusted-member list configurable in \`/app/einstellungen\`
- [ ] Audit log entry created with \`actor_kind=system\`
- [ ] Kassenwart notified via digest mail of auto-approved items
- [ ] Unit test for threshold logic
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 7 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(donations): Aufwandsspende workflow with BMF-compliant consent modal" \
  "## Source
Masterplan §15 / D9 round-1 Steuerberater. Effort: M (4–6h).

## Motivation
> An Aufwandsspende occurs when a member waives reimbursement for expenses and donates the value to the Verein. This requires BMF-compliant documentation (consent, Verzichtserklärung) to be tax-deductible.

## What to build
- In the expense approve flow: \"Als Aufwandsspende verbuchen\" toggle.
- When toggled: show modal with BMF-prescribed consent text; member must confirm (recorded in audit log).
- System creates a linked \`donation\` row (\`spende_kind=aufwandsspende\`) and a \`bezahlt_von_kind=verzicht\` marker.
- Zuwendungsbestätigung mail sent to member.

## Data-model implications
- \`spende_kind=aufwandsspende\` already in enum (was deferred in D9).
- Add \`linked_expense_id uuid\` FK on \`donations\` table (nullable, for Aufwandsspende traceability).
- \`zahlungsart_kind=verzicht\` already in enum.
- Add \`consent_given_at\` + \`consent_ip_prefix\` columns to \`donations\` for BMF audit trail.

## Definition of Done
- [ ] Steuerberater-reviewed consent modal text (BMF-Schreiben 2021 compliant)
- [ ] \`donation\` row created with correct \`spende_kind=aufwandsspende\`
- [ ] Linked \`expense\` marked \`status=erstattet\` (Verzicht = Erstattung)
- [ ] Zuwendungsbestätigung PDF generated
- [ ] Audit log records consent with IP prefix
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 8 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(accounting): post-Festschreibung sphere_overrides table + effective_sphere()" \
  "## Source
Masterplan §15 / D11 round-4 DB. Effort: M (3–4h). ADR-0008.

## Motivation
> After Festschreibung a booking's sphere sometimes needs correction (e.g. Finanzamt reclassifies an expense). ADR-0008 specifies a \`sphere_overrides\` table and an \`effective_sphere()\` function to handle this without mutating the original row.

## What to build
- \`sphere_overrides\` table (stub exists in schema): \`expense_id\`, \`override_sphere\`, \`reason\`, \`created_by_user_id\`, \`created_at\`.
- \`effective_sphere(expense_id)\` SQL function: returns override if present, else \`sphere_snapshot\`.
- EÜR views updated to use \`effective_sphere()\`.
- Admin UI: \`/app/ausgaben/:id\` shows override badge + reason if active.

## Data-model implications
- \`sphere_overrides\` table already stubbed in \`src/lib/server/db/schema/sphere_overrides.ts\`.
- Migration: add NOT NULL constraints + index on \`expense_id\`.
- All EÜR queries must switch from \`sphere_snapshot\` to \`effective_sphere(id)\`.

## Definition of Done
- [ ] \`sphere_overrides\` table fully migrated with constraints
- [ ] \`effective_sphere()\` function correct in all 4 sphere cases
- [ ] EÜR view uses \`effective_sphere()\`
- [ ] Override is visible in admin expense detail
- [ ] Override creates audit_log entry (\`action=update, payload={field:\"sphere_override\"}\`)
- [ ] Unit test for \`effective_sphere()\` with and without override
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 9 ───────────────────────────────────────────────────────────────────
create_issue \
  "feat(public-form): device-recognition cookie with TTDSG-compliant consent banner" \
  "## Source
Masterplan §15 / D12 (kept, dropped from v1). Effort: S (2–3h).

## Motivation
> Returning submitters (e.g. regular band members) benefit from having their name/email pre-filled. A device-recognition cookie achieves this but requires TTDSG § 25 Abs. 1 consent (stricter than DSGVO for cookies).

## What to build
- On first submission: offer opt-in cookie to remember name + email (not stored server-side — cookie only).
- Consent banner follows ePrivacy/TTDSG: explicit opt-in required (no pre-ticked box).
- On revisit: pre-fill from cookie if consent was given; show \"Nicht du?\" reset link.
- Cookie: \`HttpOnly=false\` (must be readable by JS for pre-fill), \`SameSite=Strict\`, \`Max-Age=365 days\`, \`Secure\`.

## Data-model implications
- No server-side schema changes — cookie is client-only.
- No \`auslagen_submissions\` changes needed.

## Legal
- Consent must be freely given, specific, informed, unambiguous (Art. 4 Nr. 11 DSGVO).
- TTDSG § 25: storing/reading from terminal device requires consent unless strictly necessary.
- Pre-fill convenience cookie is NOT strictly necessary → explicit opt-in required.

## Definition of Done
- [ ] Consent banner shown on first visit to /form (not on revisit if consented)
- [ ] Consent choice stored in \`localStorage\` (not cookie, to avoid TTDSG self-referential issue)
- [ ] Device cookie only set after explicit consent
- [ ] \"Nicht du? Felder löschen\" link clears cookie + localStorage
- [ ] No server-side logging of this cookie
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 10 ──────────────────────────────────────────────────────────────────
create_issue \
  "feat(admin): in-app notification bell at /app/notifications" \
  "## Source
Masterplan §15 / round-1 UX. Effort: S (2–3h).

## Motivation
> Kassenwart currently has no way to see pending action items without visiting each section. A notification bell gives a glanceable count of items needing attention.

## What to build
- Bell icon in the top nav bar with unread count badge.
- \`/app/notifications\` page listing: new Auslagen-Einreichungen, failed invoice jobs, open Mitgliedsbeitrag reminders.
- Mark-as-read: clicking a notification marks it read and navigates to the relevant entity.

## Data-model implications
- New table \`notifications\`: \`id\`, \`user_id\`, \`kind\` (enum), \`entity_kind\`, \`entity_id\`, \`read_at\`, \`created_at\`.
- EventBus handlers populate \`notifications\` on \`auslage.submitted\`, \`invoice_job.failed\`, \`beitrag.overdue\`.
- \`GET /api/notifications/unread-count\` endpoint (called on every page load, cached 30s).

## Definition of Done
- [ ] Bell visible in all \`/app/*\` routes
- [ ] Unread count accurate within 30s
- [ ] Notifications page lists all three notification types
- [ ] Mark-as-read works individually and as \"Alle als gelesen markieren\"
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 11 ──────────────────────────────────────────────────────────────────
create_issue \
  "feat(transactions): anomaly detection for unusually large expenses" \
  "## Source
Masterplan §15 / round-1 UX. Effort: M (3–4h).

## Motivation
> A 3× larger-than-usual expense in a category is a strong signal of either a data-entry error or a genuine outlier worth extra scrutiny. Surfacing this in the admin inbox reduces errors.

## What to build
- Background analysis: for each new expense, compare \`betrag_cents\` to the p75 of the same \`kategorie_id\` over the last 12 months.
- If \`betrag_cents > 3 × p75\`: add an \`anomaly\` badge to the expense in the inbox and the detail view.
- Kassenwart can dismiss the warning (stored in \`expenses.anomaly_dismissed_at\`).

## Data-model implications
- Add nullable columns to \`expenses\`: \`anomaly_score numeric\`, \`anomaly_dismissed_at timestamptz\`.
- \`v_kategorie_stats\` view: p25/p50/p75 of \`betrag_cents\` per \`kategorie_id\` (last 12 months).
- Anomaly computation runs in the EventBus handler on \`expense.created\`.

## Definition of Done
- [ ] Badge visible in inbox when anomaly detected
- [ ] Threshold (3×) configurable via settings key \`anomaly.kategorie_multiplier\`
- [ ] Kassenwart can dismiss warning (audit-logged)
- [ ] Anomaly does not block approval workflow
- [ ] Unit test for anomaly scoring function
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 12 ──────────────────────────────────────────────────────────────────
create_issue \
  "feat(notifications): Web Push for admin on new Auslage submission" \
  "## Source
Masterplan §15 / round-1 mobile. Effort: M (4–5h).

## Motivation
> Kassenwart on mobile does not want to poll the app — a Web Push notification on new Auslagen-Einreichungen means they can act immediately.

## What to build
- PWA Web Push subscription (VAPID keys).
- \`/app/einstellungen/push\` page: opt-in + test notification button.
- EventBus handler: on \`auslage.submitted\` → push to all subscribed admins.
- Graceful: push is best-effort; failed pushes do not block form submission.

## Data-model implications
- New table \`push_subscriptions\`: \`id\`, \`user_id\`, \`endpoint\`, \`p256dh\`, \`auth\`, \`created_at\`.
- Add \`VAPID_PUBLIC_KEY\` + \`VAPID_PRIVATE_KEY\` to \`.env.example\` and \`env.ts\`.

## Definition of Done
- [ ] Works on iOS 16.4+ (Safari Web Push) and Android Chrome
- [ ] Subscription stored server-side per device
- [ ] Push fired within 5s of form submission
- [ ] Expired/invalid subscriptions cleaned up silently
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 13 ──────────────────────────────────────────────────────────────────
create_issue \
  "feat(integrations): Slack/Telegram webhook for admin notifications" \
  "## Source
Masterplan §15 / round-1 UX. Effort: S (2–3h).

## Motivation
> Some Vorstände prefer Slack or Telegram to email for real-time notifications. A configurable outbound webhook covers both.

## What to build
- Settings key \`integrations.webhook_url\` (Slack Incoming Webhook or Telegram Bot API URL).
- EventBus handler: on \`auslage.submitted\` + \`invoice_job.failed\`: POST to webhook with summary message.
- Webhook format auto-detected from URL pattern (\`hooks.slack.com\` vs \`api.telegram.org\`).
- \`/app/einstellungen/integrationen\` page: configure URL + test button.

## Data-model implications
- New settings key: \`integrations.webhook_url\` (nullable text, JSON value).
- No new tables — webhooks are fire-and-forget; failures logged to \`audit_log\` with \`action=update, entity_kind=settings\`.

## Definition of Done
- [ ] Slack webhook format tested with real workspace
- [ ] Telegram bot format tested
- [ ] Webhook errors do not affect main request
- [ ] Test button in Einstellungen sends a test message
- [ ] Webhook URL stored encrypted (or as Vercel secret, not in DB) — decision in implementation
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 14 ──────────────────────────────────────────────────────────────────
create_issue \
  "feat(public): manual re-send Eingangsmail button for admin" \
  "## Source
Masterplan §15 / round-1 ops. Effort: S (1–2h).

## Motivation
> Occasionally submitters do not receive their Eingangsmail (spam filter, typo in email). Admin needs a one-click re-send without touching the database manually.

## What to build
- \"Eingangsmail erneut senden\" button in the Auslagen-Einreichung detail view (\`/app/inbox/:id\`).
- POST to \`/app/inbox/:id/resend-eingangsmail\` — increments \`send_attempt\` on the relevant \`sent_mails\` row and re-queues via EventBus.
- Button disabled if original submission status is \`erstattet\` or \`abgelehnt\`.

## Data-model implications
- No schema changes — uses existing \`sent_mails.send_attempt\` increment pattern (ADR-0005).
- New server action: \`POST /app/inbox/:id/resend-eingangsmail\`.

## Definition of Done
- [ ] Button visible in submission detail view
- [ ] Re-send increments \`send_attempt\` (not a duplicate row)
- [ ] New mail sent within 30s
- [ ] Audit log entry: \`action=update, entity_kind=auslagen_submission, payload={event:\"eingangsmail_resent\"}\`
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 15 ──────────────────────────────────────────────────────────────────
create_issue \
  "chore(deploy): custom domain buchhaltung.folgederwolke.de (CNAME)" \
  "## Source
Masterplan §15 / scope. Effort: XS (15min + DNS propagation).

## Motivation
> The production URL \`folgederwolke-app.vercel.app\` is not user-facing friendly. \`buchhaltung.folgederwolke.de\` makes the admin interface feel like a proper Vereins-tool.

## What to build
- Add CNAME \`buchhaltung.folgederwolke.de → cname.vercel-dns.com\` in DNS (Vereins-Hoster DNS panel).
- Add domain in Vercel Dashboard → Project → Domains.
- Update \`MORNING.md\` TL;DR URL.
- Update Datenschutzerklärung with canonical URL.

## Data-model implications
- None.

## Definition of Done
- [ ] CNAME record added and propagated (< 24h)
- [ ] Vercel SSL certificate issued automatically
- [ ] \`https://buchhaltung.folgederwolke.de\` loads the app
- [ ] \`folgederwolke-app.vercel.app\` redirects to custom domain (Vercel redirect rule)
- [ ] MORNING.md updated with new URL"

# ── Issue 16 ──────────────────────────────────────────────────────────────────
create_issue \
  "feat(banking): MoneyMoney / FinTS webhook for auto-mark-paid" \
  "## Source
Masterplan §15 / round-1 UX, longer-term. Effort: L (8–12h).

## Motivation
> Kassenwart currently manually marks expenses as \`erstattet\` after doing the bank transfer. MoneyMoney (macOS banking app) can push transaction webhooks — matching incoming credits against open expenses would automate this last manual step.

## What to build
- \`POST /api/webhooks/banking\` endpoint (secret-verified via HMAC).
- Transaction matching: compare \`betrag_cents\`, \`bezahlt_von_display\` (IBAN hint), date window (±7 days) against open \`expenses\` with \`status=geprueft\`.
- On match: set \`status=erstattet\`, \`erstattet_am\`, emit audit event.
- Unmatched transactions: logged to new \`bank_transactions\` staging table for manual review.

## Data-model implications
- New table \`bank_transactions\`: \`id\`, \`transaction_date\`, \`amount_cents\`, \`counterparty_iban\`, \`counterparty_name\`, \`reference\`, \`matched_expense_id\` (nullable), \`source\` (e.g. \`moneymoney\`), \`created_at\`.
- Add \`BANKING_WEBHOOK_SECRET\` to \`.env.example\`.

## Definition of Done
- [ ] Webhook endpoint validates HMAC signature
- [ ] Matching algorithm handles ±1 cent rounding and ±7 day window
- [ ] Ambiguous matches (multiple candidates) land in manual review queue
- [ ] Kassenwart can confirm/reject auto-match from \`/app/banking\`
- [ ] Audit log entry on auto-match
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 17 ──────────────────────────────────────────────────────────────────
create_issue \
  "feat(members): self-service member login — own Auslagen + Beitrag history" \
  "## Source
Masterplan §15 / round-1 UX. Effort: M (4–6h).

## Motivation
> Members want to check the status of their own Auslagen submissions and see their Mitgliedsbeitrag history without asking the Kassenwart. Self-service reduces admin overhead.

## What to build
- \`user_role=member_self_service\` (already in enum) — members can log in via magic link.
- \`/app/meine-auslagen\` — read-only view of own \`auslagen_submissions\` + linked \`expenses\`.
- \`/app/mein-beitrag\` — read-only view of own \`member_beitrags\` rows (paid/open).
- No write access to any table. No visibility into other members' data.

## Data-model implications
- \`user_role=member_self_service\` already in enum; \`users\` table already links to \`members\` via email.
- New Postgres row-level security (RLS) or application-level filtering: all queries scoped to \`actor_user_id\`'s linked member.
- Route guards: \`/app/meine-*\` routes accessible to \`member_self_service\`; all other \`/app/*\` routes require \`admin\`.

## Definition of Done
- [ ] Member can log in via magic link (same flow as admin)
- [ ] Member sees only their own data
- [ ] No \`/app/ausgaben\`, \`/app/mitglieder\` or other admin routes accessible
- [ ] Redirected to \`/app/meine-auslagen\` after login (not admin dashboard)
- [ ] Audit log: \`sign_in\` with \`actor_kind=member_self_service\`
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 18 ──────────────────────────────────────────────────────────────────
create_issue \
  "feat(admin): editable rejection mail templates in /app/einstellungen/templates" \
  "## Source
Masterplan §15 / round-1 UX. Effort: S (2–3h).

## Motivation
> The rejection mail (\`auslage_abgelehnt\`) currently uses a hardcoded template. Kassenwart wants to personalise the wording to reflect the Verein's tone and add common rejection reasons.

## What to build
- \`/app/einstellungen/templates\` page: list all \`mail_template\` enum values with their current subject + body.
- Editable \`<textarea>\` for subject + HTML body (with variable hints, e.g. \`{{name}}\`, \`{{betrag}}\`, \`{{reason}}\`).
- Templates stored in \`settings\` table (key: \`mail.template.<template_name>.subject\` etc. — already supported by \`settings\` JSONB schema).
- Falls back to hardcoded defaults if no custom value in \`settings\`.

## Data-model implications
- No schema changes — \`settings\` table with JSONB value already handles structured mail templates.
- Update \`sendMail()\` to check \`settings\` before falling back to code-level template strings.

## Definition of Done
- [ ] All mail templates editable via UI
- [ ] Variable substitution works with custom templates
- [ ] Fallback to default if settings key absent
- [ ] Preview button sends test mail to logged-in admin
- [ ] Changes audit-logged (\`action=update, entity_kind=settings\`)
- [ ] E2E test tagged \`@phase-2\`"

# ── Issue 19 ──────────────────────────────────────────────────────────────────
create_issue \
  "chore(security): migrate env-var bootstrap to 1Password op:// references" \
  "## Source
Masterplan §15 / post-launch credential hygiene. Effort: S (2–3h).

## Motivation
> Currently all secrets are copied from 1Password into \`.env\` manually. 1Password CLI (\`op\`) supports \`op://\` references that allow \`.env\` to contain only references, not actual secrets — eliminating the risk of accidentally committing a populated \`.env\`.

## What to build
- Convert \`.env.example\` to show \`op://\` reference format for all secret fields.
- Create \`.env.op-template\` with full \`op://vault/item/field\` references for all secrets.
- Update README / RUNBOOK with: \`op run --env-file .env.op-template -- pnpm dev\`.
- CI: GitHub Actions already uses Secrets directly (no change needed there).
- Vercel: secrets remain in Vercel env (not via 1Password, which has no native Vercel integration).

## Data-model implications
- None.

## Vault structure suggestion
\`\`\`
1Password Vault: folgederwolke-app
  Item: production-secrets
    DATABASE_URL          op://folgederwolke-app/production-secrets/DATABASE_URL
    SESSION_SECRET        op://folgederwolke-app/production-secrets/SESSION_SECRET
    GOOGLE_OAUTH_REFRESH_TOKEN  op://folgederwolke-app/production-secrets/GOOGLE_OAUTH_REFRESH_TOKEN
    ... (all other secrets)
\`\`\`

## Definition of Done
- [ ] \`.env.op-template\` file committed with all \`op://\` references
- [ ] \`.env\` (plaintext) added to \`.gitignore\` confirmation
- [ ] RUNBOOK §1 updated with \`op run\` instructions
- [ ] Local dev workflow tested: \`op run --env-file .env.op-template -- pnpm dev\` works
- [ ] No actual secret values in any committed file"

log "All 19 Phase 2 issues processed."
