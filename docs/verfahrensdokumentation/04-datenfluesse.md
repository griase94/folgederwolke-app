# Abschnitt 4 — Datenflüsse und Schnittstellen

> Auto-populated from route structure and event bus. Update when new integrations are added.

## 4.1 Eingangskanäle

### 4.1.1 Öffentliches Auslagen-Formular (`/form`)

```
Einreicher (Browser)
  → POST /form (SvelteKit Server Action)
  → auslagen_submissions INSERT (status=zu_pruefen, source=form)
  → EventBus: auslage.submitted
    → audit_log INSERT (action=create, entity_kind=auslagen_submission)
    → sendMail(auslage_eingang) via sent_mails + SMTP/Resend
  → Beleg-Upload → Google Drive (FileStorage interface)
```

Feature-Flag: `PUBLIC_FORM_ENABLED=true`. DPA-Voraussetzung: Vercel + Neon AVV unterschrieben.

### 4.1.2 Admin-Erfassung (`/app/ausgaben/neu`)

```
Admin (Browser)
  → POST /app/ausgaben (Server Action, auth-gated)
  → expenses INSERT (source=app)
  → EventBus: expense.created → audit_log INSERT
```

### 4.1.3 Sheet-Importer (`/app/importer`)

```
Admin → Trigger Import
  → scripts/import-run via Google Sheets API (read-only scope)
  → import_runs INSERT
  → expenses/income UPSERT (source=sheet_import, business_id deduplication per ADR-0010)
  → audit_log INSERT (action=import)
```

### 4.1.4 Magic-Link-Authentifizierung

```
Admin → POST /auth/magic-link (E-Mail-Eingabe)
  → sent_mails INSERT (template=magic_link, idempotent per ADR-0005)
  → SMTP/Resend → E-Mail mit Token
  → Admin → GET /auth/verify?token=…
  → Session-Cookie setzen (HttpOnly, Secure)
  → audit_log INSERT (action=magic_link_verify)
```

## 4.2 Ausgangskanäle

### 4.2.1 E-Mail-Versand

Alle ausgehenden Mails laufen über `src/lib/server/mail/send.ts` (Wrapper um SMTP oder Resend).  
Idempotenz-Schutz via `sent_mails` (ADR-0005).  
Templates: `magic_link`, `auslage_eingang`, `auslage_erstattet`, `auslage_abgelehnt`,  
`spende_bescheinigung`, `beitrag_reminder`, `invoice_versendet`.

### 4.2.2 Rechnungs-PDF

```
Admin → POST /app/rechnungen/:id/generieren
  → invoice_jobs INSERT (status=queued)
  → Vercel Cron (täglich 03:00 UTC) / on-demand Trigger
  → pdf-lib in-process rendering
    (see src/lib/server/pdf/templates/rechnung-v2/)
  → invoices UPDATE (pdf_status=generated, pdf_bytes)
  → optional: Vercel Blob upload (best-effort convenience storage)
```

### 4.2.3 EÜR-Export

```
Admin → GET /app/eur/export?year=YYYY
  → SELECT via app_export role (read-only)
  → CSV/XLSX-Download im Browser
```

## 4.3 Externe Dienste und Schnittstellen

| Dienst                       | Protokoll         | Richtung      | Zweck                          |
| ---------------------------- | ----------------- | ------------- | ------------------------------ |
| Neon PostgreSQL              | TLS/TCP (pg wire) | Bidirektional | Datenhaltung                   |
| Google Drive API v3          | HTTPS/REST        | Ausgehend     | Beleg-/PDF-Speicherung, Backup |
| Google Docs API              | HTTPS/REST        | Ausgehend     | Rechnungs-Template-Merge       |
| Google Sheets API            | HTTPS/REST        | Eingehend     | Importer (read-only)           |
| SMTP (info@folgederwolke.de) | STARTTLS/587      | Ausgehend     | Transaktionsmails v1           |
| Resend API                   | HTTPS/REST        | Ausgehend     | Transaktionsmails v2 (geplant) |
| GitHub API                   | HTTPS/REST        | Ausgehend     | Backup-Push                    |
| Vercel                       | HTTPS             | Bidirektional | Hosting, Cron-Trigger          |

## 4.4 Event Bus

`src/lib/server/events/bus.ts` — synchroner In-Process-Event-Bus.  
Emitter: Route-Actions und Cron-Handler.  
Handler: `auditLog`, `sendMail`, zukünftige Webhook-Integrationen.  
Alle buchführungsrelevanten Aktionen emittieren ein Event vor dem Response.

## 4.5 Keine Drittanbieter-Analytics

Die App enthält kein clientseitiges Tracking (kein Google Analytics, kein Plausible).  
Server-Logs: Vercel-seitig (30 Tage Retention, EU-Region).
