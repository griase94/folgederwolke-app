# DSGVO / Legal Compliance Review — folgederwolke-app

**Datum:** 2026-05-19
**Reviewer:** Compliance review agent (read-only audit)
**Scope:** Phase 7.5 compliance hardening as merged on `phase-2-public-form` branch
**Verein:** Folge der Wolke e.V., München (VR 211227)
**Aufsichtsbehörde:** BayLDA Ansbach

---

## TL;DR

**Recommendation: DO NOT enable `PUBLIC_FORM_ENABLED=true` in production yet.**

Phase 7.5 produced an impressive paper trail (VVT, TOM, DPA tracker, Verfahrensdoku, RUNBOOK), but a depth review uncovered **structural defects** that make several of the on-paper guarantees false in code:

1. **The DPA release gate is unenforced.** `DPA_GATE_PASSED` is documented in three places but never read by the application. Anyone can set `PUBLIC_FORM_ENABLED=true` regardless of AVV status.
2. **Public legal pages render literal `[VEREIN_ADRESSE]` / `[VEREIN_VR]` / `[VEREIN_STEUERNUMMER]` placeholders** — i.e. `/datenschutz` and `/impressum` are **non-compliant with § 5 TMG and Art. 13 DSGVO** on the live site as soon as it ships.
3. **The Art. 17 "delete my data" path is broken.** `pseudonymise()` doesn't redact `expenses.extern_*` and `auslagen_submissions.extern_*`; deleting the `users` row triggers an FK cascade that UPDATEs `audit_log.actor_user_id`, which (a) silently breaks the SHA-256 hash chain and (b) is _also_ blocked by the migration-0009 REVOKE on `app_runtime`. Either the pseudonymise transaction crashes, or it silently destroys tamper-evidence — both bad.
4. **Auth events log full IP, not a prefix.** The TOM-Katalog claims "IP-Adressen im Audit-Log gekürzt", but `consumeMagicLink`, `signOut`, and `signOutEverywhere` write `actor_ip_prefix = meta.ip` (raw `getClientAddress()` value).
5. **The Datenschutzerklärung omits Spenden / Zuwendungsbestätigungen entirely** — even though the app processes donor name, address, e-mail and produces 10-year-retained tax certificates. Art. 13(1)(c) requires explicit Zweck disclosure.

**Audit risk (BayLDA / BfDI):** A 10-minute audit by either authority would identify findings #2, #4, and the legal-basis mismatch (#1 in §4 below). Combined fine exposure under Art. 83(5) DSGVO is non-trivial — small Vereine are usually given Mängelrügen first, but a formal Bescheid is plausible. **Estimated time-to-fix for launch-blockers: 3-5 working hours of code + ~2 hours legal review.**

### Severity tally

| Severity               | Count |
| ---------------------- | ----- |
| **CRIT_BLOCKS_LAUNCH** | 8     |
| **HIGH**               | 11    |
| **MED**                | 9     |
| **LOW**                | 6     |
| **Total findings**     | 34    |

### Top 5 launch-blockers

1. **#CRIT-01** — Unresolved `[VEREIN_*]` placeholders in `/datenschutz` and `/impressum` (§ 5 TMG / Art. 13 DSGVO)
2. **#CRIT-02** — `DPA_GATE_PASSED` is documented but never read by code (release-gate is theatre)
3. **#CRIT-03** — `pseudonymise()` UPDATEs `audit_log.payload` → breaks SHA-256 chain (and is blocked by REVOKE since migration 0009)
4. **#CRIT-04** — `pseudonymise()` never redacts `expenses.extern_*` or `auslagen_submissions.extern_*` PII (Art. 17 fail for Externe)
5. **#CRIT-05** — Datenschutzerklärung does not disclose Spenden-Verarbeitung; donor PII is processed without lawful-basis notice (Art. 13)

---

## Methodology

Read end-to-end:

- `docs/legal/*` (VVT, TOM, DPA tracker, DSE v1, Impressum v1)
- `docs/verfahrensdokumentation/*` (12 sections)
- `docs/RUNBOOK.md`
- `MORNING.md` (Phase 7.5 status)
- Code: all routes under `/datenschutz`, `/impressum`, `/auslage-einreichen`, `/app/dsgvo`, `/sign-in*`
- Code: `src/lib/server/{auth,audit-log,events,domain/dsgvo,domain/datenschutz,legal,mail}/**`
- Code: `src/lib/server/db/schema/**`
- Migrations: `drizzle/0000_init.sql`, `0002_roles.sql`, `0009_audit_log_hardening.sql`
- Hooks: `src/hooks.server.ts`
- CI: `.github/workflows/db-backup.yml`

Cross-referenced every promise in `tom-katalog.md` against the code path that should implement it. Cross-referenced every VVT field against actual table columns and route actions.

---

## CRIT — Findings that block public launch

### #CRIT-01 — Public legal pages render literal placeholders (§ 5 TMG, Art. 13 DSGVO)

**Files:** `docs/legal/datenschutzerklaerung-versionen/v1.md:17`, `docs/legal/impressum-versionen/v1.md:12,19,25,44`; `src/lib/server/legal/loader.ts`

**Behaviour:** `loadCurrentLegalDoc()` reads the markdown file, strips the front-matter HTML comment, and returns the raw text. `marked.parse()` then converts it to HTML. There is **no template substitution** for `[VEREIN_ADRESSE]`, `[VEREIN_VR]`, `[VEREIN_STEUERNUMMER]`. The live pages will display these placeholders verbatim.

**Article/§:** § 5 Abs. 1 Nr. 1, 4 TMG (Impressumspflicht); Art. 13 Abs. 1 lit. a DSGVO (Identität des Verantwortlichen).

**Fix (developer agent):**

- Either substitute placeholders at render time using `env.VEREIN_*` (loader.ts: `markdown.replace(/\[VEREIN_ADRESSE\]/g, env.VEREIN_ADRESSE)`),
- OR replace the placeholders with literal values in the v1.md files and commit a v2.md that supersedes it.

Recommended approach: env-driven substitution because it lets you keep `.env` as source of truth and avoids leaking the Verein's full address into git history (already there, but principle).

### #CRIT-02 — `DPA_GATE_PASSED` is documented but unenforced

**Files:** `docs/legal/auftragsverarbeitung/README.md:19`, `docs/verfahrensdokumentation/08-datenschutz.md:52`, `MORNING.md:70,182`; `src/lib/server/env.ts` (env schema)

**Behaviour:** Three documents tell the operator to set `DPA_GATE_PASSED=true` in Vercel after signing Vercel + Neon DPAs. **No code reads this variable.** `env.ts` does not declare it. `PUBLIC_FORM_ENABLED` is the only gate, and there is no logical AND with DPA status.

```bash
$ grep -rn "DPA_GATE_PASSED" src/ scripts/   # zero hits
```

**Article/§:** Art. 28 DSGVO (Auftragsverarbeitung) — without signed AVVs the joint controller relationship with Vercel/Neon is legally undefined.

**Fix (developer agent):**

1. Add `DPA_GATE_PASSED: z.string().default("false").transform(v => v === "true")` to `env.ts`.
2. Gate `PUBLIC_FORM_ENABLED` effectively by changing `if (!env.PUBLIC_FORM_ENABLED)` in `+page.server.ts:64,121` to `if (!env.PUBLIC_FORM_ENABLED || !env.DPA_GATE_PASSED)`.
3. Same gate in `src/routes/+page.server.ts:21`.
4. Add a startup log line that explicitly reports both gate values so operators see them in Vercel logs.

### #CRIT-03 — `pseudonymise()` UPDATEs `audit_log.payload`; conflicts with REVOKE + hash chain

**Files:** `src/lib/server/domain/dsgvo.ts:307-323`; `drizzle/0002_roles.sql:34`; `drizzle/0009_audit_log_hardening.sql:31`; `src/lib/server/audit-log/verifier.ts`

**Behaviour:** `pseudonymise()` runs:

```ts
await tx.update(auditLog).set({ payload: sql`...` }).where(...)
```

But `app_runtime` has `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log` (migration 0009). The transaction will **fail at runtime** with a Postgres permission error. The comment in dsgvo.ts:307 even acknowledges this — "Phase 7.5 REVOKE will prevent UPDATE from app_runtime — until then this UPDATE is permitted" — but 0009 has already shipped.

If the REVOKE were lifted (don't!), there's a second issue: `audit_log.payload` is part of the SHA-256 row hash. UPDATEing payload without recomputing `row_hash` makes every modified row look tampered to the verifier (`verifier.ts:115`). The next nightly verifier run flags chain breaks, RUNBOOK §4 triggers, and the Vorstand thinks they have been hacked.

**Article/§:** Art. 17 (Recht auf Löschung) cannot be honoured technically; collides with GoBD Tz. 64–68 (Unveränderbarkeit).

**Fix (developer agent):** Drop the audit_log UPDATE entirely. Instead:

1. Don't redact existing audit_log rows. Audit log entries are not "personenbezogene Daten" in the GDPR-cancellable sense — they are records of a legal obligation (§ 147 AO + GoBD), Art. 17(3)(b) exception applies.
2. After a pseudonymise call, future audit log inserts naturally reference the now-pseudonymised member by `entity_id` (UUID) only; no name/email/IBAN ever entered the payload in the first place (verify each handler).
3. Audit-log over-redaction is a separate, documented risk under "Restrisiken" in `10-risikomanagement.md` — escalate this to BayLDA only if a Betroffener formally complains.

If you still want some scrubbing for entries where free-text fields leaked PII into payload, do it via a privileged maintenance script that runs as the migration role + recomputes the chain from the affected break point onward (this is a substantial piece of work — defer to Phase 8).

### #CRIT-04 — `pseudonymise()` ignores `expenses.extern_*` and `auslagen_submissions.extern_*`

**Files:** `src/lib/server/domain/dsgvo.ts:198-353`

**Behaviour:** When an Externer (e.g. Gastmusiker) submits an Auslage, their `extern_name`, `extern_iban`, `extern_email` are persisted in `auslagen_submissions`. On approval, the values are copied to `expenses.extern_name`, `extern_iban`, `extern_email`. The `pseudonymise()` function:

- Searches `auslagen_submissions` in `collectAuskunft()` (good)
- Does **NOT** search `expenses` in `collectAuskunft()` (bug — Art. 15)
- Does **NOT** UPDATE either table to null out the extern\_\* fields (bug — Art. 17)

After a "delete my data" request from an Externer, their full PII (incl. **IBAN**) survives in `expenses` and `auslagen_submissions` for the full 10-year § 147 AO retention.

**Article/§:** Art. 15 (Auskunftsrecht), Art. 17 (Löschung). Bonus: § 22 BDSG-special-categories-style sensitive-data argument applies if IBAN is treated as financial data.

**Fix (developer agent):**

1. Extend `collectAuskunft()` to query `expenses` by `lower(extern_email)` and include the rows in the returned `AuskunftData`.
2. Add `expensesRedacted` and `auslagenSubmissionsRedacted` to `PseudonymiseResult`.
3. In the transaction, UPDATE `auslagen_submissions` and `expenses` rows by `lower(extern_email) = ?` setting `extern_name=NULL`, `extern_iban=NULL`, `extern_email=NULL`, `bezahlt_von_display='****'`. Keep `betrag_cents`, `business_id`, `gebucht_am` (§ 147 AO requires the _Buchungstatsache_, not the _Person_ — anonymisation is GoBD-compatible).
4. Verify the new code does not blow up on `app_runtime` UPDATE rights — these tables permit UPDATE.

### #CRIT-05 — Datenschutzerklärung omits Spenden / Zuwendungsbestätigungen

**Files:** `docs/legal/datenschutzerklaerung-versionen/v1.md`

**Behaviour:** The DSE describes only Auslagen, Mitglieder, and "technische Daten". The app processes donations from named donors (`donations.spender_name`, `spender_adresse`, `spender_email`), generates Zuwendungsbestätigungs-PDFs, and retains the donor's full address for 10 years (§ 50 EStDV). The Verarbeitungstätigkeit is documented in VVT-3 but never disclosed in the public DSE.

**Article/§:** Art. 13 Abs. 1 lit. c DSGVO — Zweck der Verarbeitung must be disclosed.

**Fix (developer agent):**
Add a section to `docs/legal/datenschutzerklaerung-versionen/v2.md`:

> **Spenden und Zuwendungsbestätigungen**
> Wenn du an den Verein spendest und eine Zuwendungsbestätigung erhältst, verarbeiten wir Name, Anschrift, ggf. E-Mail-Adresse und Betrag der Zuwendung zum Zweck der Ausstellung der Zuwendungsbestätigung (§ 50 EStDV). Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Verpflichtung zum Nachweis gemeinnütziger Mittelverwendung). Aufbewahrungsfrist: 10 Jahre gemäß § 50 Abs. 4 EStDV.

Bump `DATENSCHUTZ_VERSION` in `src/lib/domain/datenschutz.ts` (next AUS-submission consent re-prompts).

### #CRIT-06 — Auth-event audit log stores **full** IP, not prefix

**Files:** `src/lib/server/auth/index.ts:210,246,370,400`; `docs/legal/tom-katalog.md:66`

**Behaviour:** `consumeMagicLink`, `signOut`, `signOutEverywhere` all call:

```ts
logAudit({ ..., actorIpPrefix: meta.ip, ... })
```

where `meta.ip = getClientAddress()` — the **full** IPv4 or IPv6 address. The column is named `actor_ip_prefix`, the TOM-Katalog asserts "nur Prefix, nicht vollständige IP", but the data is the full address.

In `auslage-einreichen/+page.server.ts:127` and the events bus the field IS correctly truncated via `ipPrefix()`. Only the auth paths are broken.

**Article/§:** Art. 5 Abs. 1 lit. c DSGVO (Datenminimierung); Art. 32 (TOMs — Pseudonymisierung dokumentiert aber nicht umgesetzt).

**Fix (developer agent):**

1. Import `ipPrefix()` from `src/routes/auslage-einreichen/+page.server.ts` (or extract to `src/lib/server/auth/ip.ts` and re-use).
2. Pass `ipPrefix(meta.ip)` to all 4 logAudit calls.
3. Add a unit test that asserts `actor_ip_prefix` for sign-in events never contains more than 2 dotted-decimal octets (IPv4) or more than the first hextet (IPv6).
4. Optional: backfill existing audit_log rows where `length(actor_ip_prefix) > 8` — but you can't UPDATE audit_log post-0009, so just leave them. They were inserted before this fix and a Datenpanne report is overkill. Note them in `10-risikomanagement.md` as a "pre-Phase-7.6 legacy data" item.

### #CRIT-07 — Hash chain trigger contradicted by `audit_log.actor_user_id ON DELETE SET NULL`

**Files:** `drizzle/0000_init.sql:400`; `drizzle/0009_audit_log_hardening.sql`; `src/lib/server/db/schema/audit_log.ts:38-40`

**Behaviour:** When `pseudonymise()` deletes a `users` row, Postgres cascades via `ON DELETE SET NULL` to all `audit_log.actor_user_id` references. This UPDATEs `audit_log` rows — which:

1. Is blocked by `REVOKE UPDATE ON audit_log FROM app_runtime` (migration 0009).
2. Would, if not blocked, silently change a field that's part of the SHA-256 row_hash → every affected row reports as tampered to `verifier.ts` next cron run.

So either pseudonymise crashes (today's reality — see #CRIT-03 also forces a crash) or, post-fix, you fail-safe but emit a different bug.

**Article/§:** Art. 17 vs. § 147 AO + GoBD Tz. 64–68.

**Fix (developer agent):**

1. Change the FK to `ON DELETE NO ACTION` (default). Don't delete the user — instead, mark `users.disabled_at = now()` and pseudonymise `users.email` to `deleted-{id}@example.invalid` (the schema already supports `disabled_at`).
2. Update `pseudonymise()` to set `users.email = …; users.email_canonical = …; users.disabled_at = now()` rather than DELETE.
3. Keep the FK constraint pointing at a still-existing row.
4. Document this in `08-datenschutz.md` as "Pseudonymisierung statt Löschung gemäß Art. 17(3)(b) i.V.m. § 147 AO".

### #CRIT-08 — Public DSE marked "in Vorarbeit / externe Prüfung ausstehend"

**Files:** `docs/legal/datenschutzerklaerung-versionen/v1.md:5,10`; `src/routes/datenschutz/+page.svelte:15-17`

**Behaviour:** The live `/datenschutz` page renders a yellow banner saying "Diese Datenschutzerklärung ist in Vorarbeit; sie wird vor öffentlichem Launch durch externe Prüfung finalisiert." This banner shipping in production is **itself** a finding: it signals to the user that the controller knows the DSE is incomplete but is collecting data anyway.

**Article/§:** Art. 12, 13 DSGVO — Transparenz; Art. 5 Abs. 1 lit. a (Rechtmäßigkeit).

**Fix (Andy must do):**

1. Engage a Verein-savvy lawyer or use the BayLDA Verein-Mustertext (which is what the DSE was supposedly based on) for a final pass.
2. Remove the banner. The presence of the banner _while collecting data through `/auslage-einreichen`_ is the audit-flag-magnet.

---

## HIGH — Should be fixed before broad rollout

### #HIGH-01 — Lawful-basis mismatch for Externe: DSE vs. VVT vs. Verfahrensdoku

| Source            | Stated basis for Externe                             |
| ----------------- | ---------------------------------------------------- |
| DSE v1 §4         | Art. 6 Abs. 1 **lit. b** (vorvertragliche Maßnahmen) |
| VVT-1             | Art. 6 Abs. 1 **lit. f** (berechtigtes Interesse)    |
| 08-datenschutz.md | Art. 6 Abs. 1 **lit. f** (berechtigtes Interesse)    |

**Why this matters:** lit. b requires the Externe person to be entering / preparing a contract with the Verein. A one-off Auslage from a Gastmusiker is more naturally lit. f. Under lit. f you owe a documented `Interessenabwägung`; under lit. b you don't. Pick one and align all three.

**Fix (Andy + developer agent):** Decide lit. f (recommended — it's defensible and consistent with VVT). Update the DSE accordingly and add the Interessenabwägung as a short paragraph in `08-datenschutz.md`.

### #HIGH-02 — Contact e-mail for data-subject requests mismatched across three locations

| File                                               | E-Mail                         |
| -------------------------------------------------- | ------------------------------ |
| `docs/legal/datenschutzerklaerung-versionen/v1.md` | `andy@folgederwolke.de`        |
| `docs/legal/impressum-versionen/v1.md`             | `andy@folgederwolke.de`        |
| `src/lib/domain/datenschutz.ts:23` (consent text)  | `folgederwolke@gmail.com`      |
| `08-datenschutz.md` (`<!-- FILL -->`)              | `datenschutz@folgederwolke.de` |

Submitters who try to exercise rights using the address in the public form will hit a Gmail address. The Impressum and DSE point at `@folgederwolke.de`. Multiple addresses look unprofessional and may be invalid (does `andy@folgederwolke.de` exist?).

**Fix (Andy):** Decide one address. Recommended: `datenschutz@folgederwolke.de` (function-based, survives Vorstand changes). Update DSE, Impressum, AND `src/lib/domain/datenschutz.ts` — the latter triggers a new `DATENSCHUTZ_VERSION`.

### #HIGH-03 — Audit-log payload may contain raw email / name (Art. 17 leakage)

**Files:** `src/lib/server/auth/index.ts:211,247`; `src/lib/server/events/handlers.ts:70-74,...`

**Behaviour:** Audit payloads include literal `{email}`, `vorname`, `nachname`, `iban` strings. `pseudonymise()` attempts to strip these (dsgvo.ts:307-323) but, as noted in #CRIT-03, that UPDATE will fail. So in practice the payload retains the PII.

**Fix (developer agent):** Reduce what goes into `payload` in the first place. Replace `payload: { email }` with `payload: { user_id }` for sign-in audit rows. The user UUID is opaque, not personenbezogen in isolation. Apply broadly across `handlers.ts`.

### #HIGH-04 — `/datenschutz` and `/impressum` not linked from `/auslage-einreichen` footer

**Files:** `src/lib/components/forms/AuslagenForm.svelte:545`; `src/routes/auslage-einreichen/+page.svelte`

**Behaviour:** The DSE link inside the consent block is good, but the Impressum is not linked at all from the public form page. § 5 TMG requires Impressum to be "leicht erkennbar" and "unmittelbar erreichbar" from every public page — i.e. one click away.

**Fix (developer agent):** Add a footer to the public form layout with `/impressum` and `/datenschutz` links. Same for `/sign-in`.

### #HIGH-05 — `auslagen_submissions.submitter_ip_prefix` stored but never noted in DSE / VVT-1

The DSE §2 lists data collected by the form but omits IP-prefix and UA-hash. The VVT-1 also doesn't list these in `Datenkategorien`. They are TOM-relevant (abuse tracking, Art. 6 Abs. 1 lit. f) and should be disclosed.

**Fix:** Add to DSE §2.1 (Auslagen-Einreichung):

> Zur Abwehr von Missbrauch verarbeiten wir zusätzlich einen gekürzten IP-Adress-Präfix und einen Hash deines User-Agents (technische Maßnahme gegen Spam). Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse: IT-Sicherheit). Speicherdauer: identisch mit dem Buchungsbeleg.

Update VVT-1 Datenkategorien accordingly.

### #HIGH-06 — Vercel / Neon DPAs marked `TODO` — public form must not be launched

**Files:** `docs/legal/auftragsverarbeitung/README.md:28-29`

**Behaviour:** Status column shows `TODO` for both. The README and Verfahrensdoku correctly say "PUBLIC_FORM_ENABLED only with both signed" — but see #CRIT-02, this is not enforced.

**Fix (Andy):** Sign both DPAs. Update the README table to `signed` with date. Only THEN flip `PUBLIC_FORM_ENABLED=true` and (after #CRIT-02 fix) `DPA_GATE_PASSED=true`.

### #HIGH-07 — Google Drive marked `TODO` and uses OAuth as personal Google account

**Files:** `docs/legal/auftragsverarbeitung/README.md:30`; `docs/RUNBOOK.md:35-49`

**Behaviour:** Beleg-Dateien (mit PII) live in Google Drive under Andy's personal Google account (`OAuth as Andy`). Without an enterprise Google Workspace contract, the DPA boilerplate Google offers (Google Cloud DPA) does not cleanly apply to a personal account. Drive's standard ToS applies — which is not Art. 28 DSGVO-conform.

**Article/§:** Art. 28 DSGVO requires a written AVV; Art. 44+ for US transfers (Google US-based, DPF-applicable but only for Workspace tenants, not personal accounts in some readings).

**Fix (Andy):** Either

- Move the file storage to a Google Workspace tenant owned by Folge der Wolke e.V. and sign the Google DPA, OR
- Move file storage to a DSGVO-native EU provider (Hetzner Storage Box, IONOS HiDrive, Nextcloud).

Until then, the public form launch is on shaky AVV ground for the Beleg pipeline.

### #HIGH-08 — Vercel logs retain full IP for 30 days, listed correctly but with US-transfer risk

**Files:** `docs/legal/verzeichnis-verarbeitungstaetigkeiten.md:104-106`; `docs/legal/datenschutzerklaerung-versionen/v1.md:77`

The VVT correctly notes "Vercel ist US-Unternehmen; EU-Region-Verarbeitung + SCCs". The DSE relies on "EU-US Data Privacy Framework". Both are technically correct **provided** Vercel is actually self-certified under DPF (they are, as of 2024) AND data is pinned to `fra1` (Frankfurt). Verify env config:

**Fix (developer agent):**

- Check `vercel.json` for `regions: ["fra1"]` or equivalent.
- Document in 02-dv-systemumgebung.md that this is verified at deploy time.

### #HIGH-09 — `ADMIN_EMAILS` is the only authz boundary for `/app/dsgvo` (PII export)

**Files:** `src/routes/app/dsgvo/auskunft.pdf/+server.ts`; `src/lib/server/auth/allowlist.ts`

**Behaviour:** Anyone in `ADMIN_EMAILS` can generate a full PII PDF for any e-mail by entering it into the form. There is no Vier-Augen-Prinzip, no logging of _which admin pulled which person's data_, no rate-limit, and the Steuerberater role (read-only) presumably also has this access via `/app` layout — needs verification.

**Article/§:** Art. 32(1)(b) DSGVO — "Vertraulichkeit … unter Berücksichtigung der Verarbeitungsschwere".

**Fix (developer agent):**

- Log every Auskunft-PDF generation to `audit_log` with `action=read`, `entity_kind=member`, `payload={target_email}`. (Note: `audit_action` enum doesn't have `read` — add it.)
- Verify role gate: at minimum require `user_role=admin`, not `steuerberater`.
- Consider rate-limit (one Auskunft per minute) to prevent enumeration.

### #HIGH-10 — Audit chain has no off-Postgres anchoring proof of when chain rows existed

**Files:** `.github/workflows/audit-anchor.yml`; RUNBOOK §4

**Behaviour:** ADR-0004 mentions a weekly off-PG anchor (write `chain_head` row_hash to a private GitHub repo + Drive). The workflow file exists; I did not verify it actually runs and that the anchored hash is trustworthy. If it's just signing a value that comes from the same Neon DB, the anchor is circular.

**Fix (Andy + developer agent):**

- Confirm the audit-anchor workflow runs successfully on schedule.
- Confirm the anchor commits the SHA to a repo that the technical operator does NOT have force-push to (e.g. via branch protection).
- Document the verification procedure in RUNBOOK §4.

### #HIGH-11 — `sent_mails` retains recipient e-mail forever (no scheduled retention)

**Files:** `src/lib/server/db/schema/mails.ts`; `src/routes/api/cron/daily-dispatcher/+server.ts`

**Behaviour:** VVT-5 promises "3 Jahre Aufbewahrung" for sent_mails. There is no cron job that prunes rows older than 3 years. The daily-dispatcher only prunes `magic_links`, `sessions`, `rate_limit_attempts`.

**Article/§:** Art. 5 Abs. 1 lit. e DSGVO (Speicherbegrenzung).

**Fix (developer agent):** Add to `daily-dispatcher`:

```sql
DELETE FROM sent_mails WHERE queued_at < now() - interval '3 years';
```

Document in 07-unveraenderbarkeit.md.

---

## MED — Important but not launch-blocking

### #MED-01 — VVT lacks the DSGVO-required fields "Risikobewertung" and "Datenkategorien Quelle"

VVT-1 .. VVT-7 omit:

- Quelle der Daten (direkt vom Betroffenen vs. abgeleitet vs. Dritte)
- Risiko-Bewertung (Eintrittswahrscheinlichkeit × Schadensausmaß)

These are _not_ strictly mandated by Art. 30 wording, but BayLDA's `Muster-VVT` template lists them. Audit-resistant VVTs include both.

**Fix (Andy + agent):** Add two columns to each VVT entry.

### #MED-02 — `Datenschutzbeauftragter` (DSB) status not formally documented

**Files:** `docs/verfahrensdokumentation/08-datenschutz.md:33-39`

The `<!-- FILL -->` says to verify § 38 BDSG threshold (≥ 20 Personen mit ständiger Datenverarbeitung). Folge der Wolke e.V. is unlikely to need a DSB, but the file documents this assumption without a date.

**Fix (Andy):** Confirm "<20 Personen mit Datenverarbeitung" in writing, sign the section, remove the FILL marker.

### #MED-03 — No procedure for handling third-party Auskunft requests (Art. 15 by post)

The DSE says "wende dich per E-Mail an: andy@folgederwolke.de" but doesn't say what happens if someone writes by post (which they have a right to do — Art. 12 doesn't mandate any specific channel). Also no documented identity-verification step ("Wir senden die Daten nur an die hinterlegte E-Mail" or similar).

**Fix (Andy):**

1. Add an Identitätsnachweis-Schritt to the procedure (e.g. send PDF only to the hinterlegte E-Mail, never to a different reply address).
2. Add a one-month-deadline policy text (Art. 12 Abs. 3).

### #MED-04 — Backup encryption key rotation procedure relies on 1Password — no recovery plan if Andy is unavailable

**Files:** `docs/RUNBOOK.md:82-95`

**Behaviour:** The age private key lives only in Andy's 1Password. If Andy is incapacitated, the backups are unrecoverable.

**Fix (Andy):** Document a key-escrow procedure. E.g. seal a printed copy of the private key in an envelope held by Vorstand-Mitglied #2. Reference in RUNBOOK.

### #MED-05 — Mail tracking: SMTP provider unspecified, open/click tracking not explicitly disabled

**Files:** `src/lib/server/mail/smtp.ts`; `src/lib/server/mail/templates/MagicLink.svelte`

**Behaviour:** v1 uses SMTP via `info@folgederwolke.de` mail hoster. Many hosters insert open-pixel trackers. The codebase doesn't disable tracking explicitly (most SMTP providers don't track, but it's not impossible). The DSE doesn't mention the mail hoster by name.

**Fix (Andy):**

1. Identify the SMTP hoster (who hosts `folgederwolke.de`?). Add to DSE §5 as named processor.
2. Confirm with hoster that no open/click tracking is enabled.
3. Document.

### #MED-06 — Cookie banner: claimed "keine nicht-essentielle Cookies" — needs proof

**Files:** `docs/legal/datenschutzerklaerung-versionen/v1.md:127-133`

**Behaviour:** DSE claims "ausschließlich technisch notwendige Session-Cookies". This is plausible (only a session cookie + an intent cookie are set in auth/cookies.ts) but should be empirically verified — e.g. via `curl -I` against the production deployment listing all `Set-Cookie` headers.

**Fix (developer agent):** Add a CI check that enumerates `Set-Cookie` headers from all routes and fails if any cookie is set without explicit consent. Or just spot-check in DevTools and screenshot for the legal review file.

### #MED-07 — TOM-Katalog claims `audit_log` actor_user_id will identify the actor — conflicts with anonymisation goal

**Files:** `docs/legal/tom-katalog.md:124`

**Behaviour:** TOM 10.1 ("Vollständiger Audit-Trail") works against TOM 5 (Pseudonymisierung). Once you pseudonymise a user, the audit trail's `actor_user_id` becomes a meaningless UUID pointing at a `deleted-…@example.invalid` row.

**Fix (Andy):** Acknowledge in TOM 10.1: "Audit-Trail bleibt vollständig; nach Pseudonymisierung des Akteurs ist nur noch die UUID-Referenz lesbar — der Akteur kann nur über interne Verknüpfungstabellen identifiziert werden." This is GoBD-konform per Art. 17(3)(b).

### #MED-08 — `bezahlt_von_display` is a free-text snapshot of payer name — Art. 17 leakage

**Files:** `src/lib/server/db/schema/expenses.ts:128`; `src/lib/server/db/schema/auslagen_submissions.ts:62`

**Behaviour:** This is a `text NOT NULL` snapshot for human display: "Maria K." / "Verein" / "Extern: Max Mustermann (IBAN: DEXX...)". Per #CRIT-04, `pseudonymise()` does not redact it. Even after fixing #CRIT-04, the `bezahlt_von_display` column needs to be overwritten to "\*\*\*\*" too.

**Fix (developer agent):** Add `bezahltVonDisplay: "****"` to the expenses/auslagen_submissions UPDATE in pseudonymise.

### #MED-09 — Auskunft PDF lists IBAN in plain text — header should warn

**Files:** `src/lib/server/pdf/auskunft.ts:217`

**Behaviour:** The Art. 15 PDF includes the member's IBAN. Justified (Art. 15(3) — Kopie der Daten), but the PDF should carry a "VERTRAULICH — enthält Bankdaten" header so it doesn't get e-mailed unencrypted to the wrong inbox.

**Fix (developer agent):** Add a red "VERTRAULICH" banner to page 1 of the Auskunft PDF.

---

## LOW — Polish / hygiene

### #LOW-01 — `02-dv-systemumgebung.md` says "Resend (geplant)" but no DPA initiated

If Resend stays unused, remove the row. If it's planned, start the DPA process now (it's pre-signed online — 30 seconds).

### #LOW-02 — `12-unterschriften.md` Steuerberater section blank

Not strictly required for DSGVO (this is the GoBD chapter), but a Steuerberater sign-off strengthens audit defensibility. Mentioned as "optional" in MORNING.md; track and chase.

### #LOW-03 — `09-mitarbeiter-schulung.md` is a skeleton

For a 1-2 person Vereinsverwaltung this is over-engineered. Andy can sign a one-paragraph statement "I have read the DSGVO obligations" and call it done. Document the date.

### #LOW-04 — `11-notfall-konzept.md` contacts blank

`<!-- FILL -->` markers for Kassenwart / 1. Vorstand contacts. Required for Datenpannen-Koordination per Art. 33 (72h).

### #LOW-05 — `10-risikomanagement.md` is dated 2026-05 with no jährliche Aktualisierung

Set a calendar reminder for May 2027.

### #LOW-06 — DSE missing children/minors warning

Even though Vereinsmitgliedschaft for minors is rare, Art. 8 DSGVO requires a notice if data of <16-year-olds may be collected. Add a short sentence: "Wir verarbeiten keine personenbezogenen Daten von Personen unter 16 Jahren. Sollten dennoch Daten von Minderjährigen eingereicht werden, bitten wir um Hinweis und löschen diese unverzüglich."

---

## Verfahrensdokumentation `<!-- FILL -->` checklist (for Andy)

These are the **literal `<!-- FILL -->` markers** that block formal sign-off:

| File                         | Section / Line     | Content needed                                                        |
| ---------------------------- | ------------------ | --------------------------------------------------------------------- |
| `01-grundlagen.md`           | 1.2                | Aktuelle Amtsträger (Vorstand, Kassenwart) namentlich                 |
| `01-grundlagen.md`           | 1.4                | Externer Steuerberater (falls beauftragt)                             |
| `05-iks.md`                  | 5.1 (top)          | IKS-Inhalte mit Andy/Kassenwart ausarbeiten                           |
| `05-iks.md`                  | 5.2                | Schwellenwerte für Vier-Augen-Prinzip (€)                             |
| `05-iks.md`                  | 5.5                | Kontrollintervalle (monatlich/vierteljährlich/etc.) + Verantwortliche |
| `05-iks.md`                  | 5.6                | Abweichungsbehandlung                                                 |
| `06-belegwesen.md`           | 6.1                | Ablageorte Kontoauszüge + Mitgliedsbeitrag-Eingänge                   |
| `06-belegwesen.md`           | 6.2                | Schwellenwert für Belegpflicht (€)                                    |
| `06-belegwesen.md`           | 6.3 (Einnahmen)    | Einnahmen-Erfassungsprozess                                           |
| `06-belegwesen.md`           | 6.6                | Digitale Belegqualität (Auflösung, Formate, max. Größe)               |
| `08-datenschutz.md`          | 8.2                | Datenschutz-Anfragen E-Mail-Adresse                                   |
| `08-datenschutz.md`          | 8.3                | DSB-Prüfung dokumentieren + Verantwortlicher Vorstand                 |
| `08-datenschutz.md`          | 8.6                | Live-URL nach Launch eintragen                                        |
| `09-mitarbeiter-schulung.md` | 9.2, 9.3, 9.4, 9.5 | Schulungsinhalte, -nachweis, -datum, Handbuch-Verweis                 |
| `10-risikomanagement.md`     | 10.2               | Verantwortlicher für Datenpannen-Koordination                         |
| `10-risikomanagement.md`     | 10.3               | Akzeptierte Restrisiken                                               |
| `10-risikomanagement.md`     | 10.4               | Revisionshistorie                                                     |
| `11-notfall-konzept.md`      | 11.2               | Kontakte (Telefon, etc.)                                              |
| `11-notfall-konzept.md`      | 11.6               | Kommunikationsplan                                                    |
| `12-unterschriften.md`       | 12.2               | Vorstand-/Kassenwart-Unterschrift                                     |
| `12-unterschriften.md`       | 12.3               | Steuerberater-Bestätigung (optional aber empfohlen)                   |
| `12-unterschriften.md`       | 12.5               | Nächste Überprüfung Datum                                             |
| `RUNBOOK.md`                 | §4.4               | Steuerberater Kontakt für GoBD-Notfälle                               |

---

## Datenpannen-Bereitschaft (Art. 33/34)

**Status:** Adequately documented (RUNBOOK + `10-risikomanagement.md` §10.2), BUT:

- 72h-Frist is named
- BayLDA contact is named (https://www.lda.bayern.de/)
- ❌ No template for the Meldung (BayLDA online form OR e-mail draft)
- ❌ No Verantwortlicher for Koordination (`<!-- FILL -->`)
- ❌ No drill: has anyone exercised the procedure?

**Fix (Andy):**

1. Draft a Datenpannen-Meldungs-Template (German Word doc), pre-filled with `Verantwortlicher`, `Verfahrensbeschreibung`, etc. — saves hours under pressure.
2. Run a 30-minute tabletop exercise once a year. Document in `09-mitarbeiter-schulung.md`.

---

## Open items split: Andy vs. developer agent

### Andy must do (organisational/legal)

1. **#CRIT-08** — engage Verein-savvy lawyer to finalise DSE; remove "Vorarbeit" banner
2. **#HIGH-01** — pick lit. b OR lit. f for Externe, align DSE + VVT + 08-datenschutz.md
3. **#HIGH-02** — pick ONE data-subject-rights e-mail address
4. **#HIGH-06** — sign Vercel DPA + Neon DPA
5. **#HIGH-07** — fix Google Drive AVV situation (Workspace tenant OR EU provider)
6. **#HIGH-10** — verify audit-anchor workflow actually runs + repo is hardened
7. **#MED-02** — formally document DSB-not-required decision
8. **#MED-04** — escrow age private key with second Vorstand member
9. **#MED-05** — identify SMTP hoster, name them in DSE
10. Fill all `<!-- FILL -->` markers in Verfahrensdoku (see table above)
11. Draft Datenpannen-Meldungs-Template (Word + BayLDA online form bookmark)
12. Schedule annual review of `10-risikomanagement.md`

### Developer agent should do (code)

1. **#CRIT-01** — template-substitute `[VEREIN_*]` placeholders in legal-doc loader
2. **#CRIT-02** — add `DPA_GATE_PASSED` to env schema and gate `PUBLIC_FORM_ENABLED` paths on it (3 files)
3. **#CRIT-03** — remove `audit_log.payload` UPDATE from `pseudonymise()`; document Art. 17(3)(b) exception
4. **#CRIT-04** — extend `collectAuskunft()` to query `expenses` by extern*email; extend `pseudonymise()` to redact extern*\* in expenses AND auslagen_submissions + `bezahlt_von_display`
5. **#CRIT-06** — fix `actorIpPrefix: meta.ip` → `actorIpPrefix: ipPrefix(meta.ip)` in 4 spots in `auth/index.ts`; add regression test
6. **#CRIT-07** — change `audit_log.actor_user_id` FK to NO ACTION; switch pseudonymise to `users.disabled_at` + email redact (no DELETE)
7. **#HIGH-03** — replace `payload: { email }` with `payload: { user_id }` in audit handlers
8. **#HIGH-04** — add `/datenschutz` and `/impressum` footer links to public layouts
9. **#HIGH-09** — add `audit_log.action = "read"` enum value; log Auskunft-PDF generations; rate-limit
10. **#HIGH-11** — add `sent_mails` retention DELETE to daily-dispatcher cron
11. **#MED-08** — overwrite `bezahlt_von_display = '****'` during pseudonymise
12. **#MED-09** — add "VERTRAULICH" banner to Auskunft PDF
13. **#CRIT-05 / #HIGH-05** — author DSE v2 with Spenden section + IP-prefix disclosure; bump `DATENSCHUTZ_VERSION`

---

## Pre-launch checklist (in order)

```
[ ] 1. Andy signs Vercel DPA → status `signed` in dpa README
[ ] 2. Andy signs Neon DPA   → status `signed` in dpa README
[ ] 3. Andy resolves Google Drive AVV (Workspace tenant or move belege)
[ ] 4. Andy or lawyer finalises DSE v2 (Spenden + IP-Prefix + named SMTP hoster)
[ ] 5. Andy picks DSGVO contact e-mail; verifies the address routes to someone
[ ] 6. Agent: PR-1 — fix #CRIT-01, #CRIT-02, #CRIT-06, #CRIT-07, #HIGH-04, #HIGH-11
[ ] 7. Agent: PR-2 — fix #CRIT-03, #CRIT-04, #CRIT-05, #HIGH-03, #MED-08, #MED-09
[ ] 8. Agent: PR-3 — DSE v2 with Spenden + IP-Prefix; bump DATENSCHUTZ_VERSION
[ ] 9. Andy fills Verfahrensdoku <!-- FILL --> markers (table above)
[ ] 10. Andy + Vorstand sign 12-unterschriften.md
[ ] 11. Manual smoke test of /datenschutz, /impressum — no placeholders visible
[ ] 12. Manual smoke test of /app/dsgvo Auskunft + Pseudonymise flows (against a test member)
[ ] 13. Run audit-chain verifier (RUNBOOK §4) — confirm chain is intact
[ ] 14. Confirm vercel.json pins region to fra1
[ ] 15. Confirm Set-Cookie headers: only session + intent cookies (#MED-06)
[ ] 16. Andy sets DPA_GATE_PASSED=true in Vercel env
[ ] 17. Andy sets PUBLIC_FORM_ENABLED=true in Vercel env
[ ] 18. Cron `audit-verify` and `audit-anchor` run successfully once
[ ] 19. Announce to Vereinsmitglieder
```

If you can check 1–17 honestly, the public form launch is defensible against a BayLDA inquiry.

---

_End of review. 34 findings. Author: agent. For questions/disputes: andy.griesbeck@gmail.com._
