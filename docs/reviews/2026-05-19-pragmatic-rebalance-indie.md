# Pragmatic Rebalance — Indie / 10-Person Verein Reality Check

**Date:** 2026-05-19
**Reviewer:** counterweight to the 9-reviewer enterprise pass
**Context anchor:** ~10 members. Solo dev. Munich Verein hosting parties. < 50 tx/month. 1–3 concurrent users ever. Gemeinnützig but BMF will not audit a €5–20k/yr Verein absent egregious behaviour. Andy's verbatim: *"we are just a bunch of friends hosting parties. Be realistic and pragmatic."*

The 9-reviewer pass produced 252 findings, 36 CRIT. Rounds A–E shipped. What remains is Round F (ops) plus the live todo list. This document re-classifies every remaining item as **KEEP / DEFER / DROP / SIMPLIFY** against the actual scale.

---

## Pending todo list — classified

### Right-now block

| # | Item | Bucket | Why |
|---|---|---|---|
| 1 | Stamp `reviewed-by-opus` + merge PR #29 + tag | **KEEP** | It's literally one command and unblocks deploy. |

### Before Julia uses it internally

| # | Item | Bucket | Why |
|---|---|---|---|
| 2 | Add Julia to `ADMIN_EMAILS` | **KEEP** | 30 seconds; she can't use the app without it. |
| 3 | Pick one DSGVO contact e-mail | **KEEP** | Use `vorstand@…` or Andy's existing address — one line in a config. |
| 4 | Set `PUBLIC_BASE_URL` in Vercel | **KEEP** | Mail links break without it. Trivial. |
| 5 | Verify live schema matches `0000–0010` | **KEEP** | One `psql` query; cheap insurance against round-D migration drift. |

### Legal gate (before public form)

| # | Item | Bucket | Why |
|---|---|---|---|
| L1 | Sign Vercel DPA | **KEEP** | Click-through, free, gemeinnütziger Verein still triggers Art. 28 if external submitters exist. |
| L2 | Sign Neon DPA | **KEEP** | Same. Both are 10-minute click-throughs. |
| L3 | Engage lawyer for DSE final pass | **DEFER** | Issue. Trigger: *first non-member submits via public form*, or membership > 25. Until then keep the Vorarbeit notice — it discloses honestly. A 10-person friend-Verein is not a DSGVO target. |
| L4 | lit. b vs lit. f decision for Externe | **SIMPLIFY** | Don't write a memo. Pick lit. b (Vertragsanbahnung — they submit a reimbursement claim, that's a quasi-contract) and add one sentence in `/datenschutz`. Done. |
| L5 | One DSGVO contact e-mail | **KEEP** | Duplicate of #3. |
| L6 | Flip `DPA_GATE_PASSED=true` | **KEEP** | The gate code already exists (Round A). Just set the var when L1+L2 done. |

### Operational gate

| # | Item | Bucket | Why |
|---|---|---|---|
| O1 | Create empty `fdw-backups` repo | **SIMPLIFY** | Skip GitHub-repo-as-backup destination entirely. Neon PITR (7 days on Launch tier, which Andy pays for) + a once-weekly `pg_dump` to Google Drive is enough. The whole "encrypted dump to a second GitHub repo" pattern is enterprise theatre at this scale. |
| O2 | Create `folgederwolke-audit-anchor` repo | **DROP** | A 10-member Verein with 0 high-trust data does not need an off-Postgres tamper-evidence anchor. Neon PITR is the anchor: an attacker who can rewrite `audit_log` and Neon's WAL backups simultaneously is not the threat model. Drop the workflow entirely. |
| O3 | Generate age keypair, escrow with Vorstand | **DROP** | Already deferred (issue #30). Keep deferred — and reconsider whether you ever need it. If backups go to Andy's personal Drive folder, that's the same trust boundary as the production DB. Encrypting them at rest with a key only Andy holds *increases* bus-factor risk for the Verein. |
| O4 | 7 GitHub Actions secrets | **SIMPLIFY** | Reduce to two: `DATABASE_URL_BACKUP` (Neon `app_export`) + `DRIVE_BACKUP_FOLDER_ID`. Drop `BACKUP_REPO`, `BACKUP_TOKEN`, `BACKUP_AGE_RECIPIENT`, `AUDIT_ANCHOR_*`. |
| O5 | Configure all 7 GH Actions secrets | **SIMPLIFY** | See O4. |
| O6 | Trigger backup workflow, verify | **KEEP** | Once. Verify a dump lands in Drive. That's it. |
| O7 | Restore drill, target RTO < 2h | **SIMPLIFY** | Do it once, informally. Document what you actually did in a paragraph. Don't write a quarterly schedule you won't keep. The realistic RTO at this scale is "Andy spends an evening on it"; a 2h target is fiction. |
| O8 | Required status checks on `main` | **DROP** | Solo dev, no PR reviewers. Branch protection requiring checks is friction without benefit. Keep CI running (catches regressions), but don't gate merge on it — Andy is the only one merging, and if CI is red he can already see it. |
| O9 | Sentry + uptime monitor | **SIMPLIFY** | Drop Sentry. Add a free UptimeRobot pinging `/healthz` every 15 min with email-on-down to Andy. That's it. Vercel's built-in function logs (1h retention) are sufficient post-mortem material for an app with < 50 tx/month — if there's an incident worth investigating, Andy was probably the one using it. |
| O10 | Wire `migrate.ts` into Vercel post-deploy | **KEEP** | Real risk: solo dev merges a migration, forgets to run it, prod crashes. One-line `vercel.json` `buildCommand` change. |

### Verfahrensdoku fills

| # | Item | Bucket | Why |
|---|---|---|---|
| V1 | Kassenwart names + phone numbers | **KEEP** | Two names. Five minutes. The "without this the Notfallkonzept is legally void" framing from the ops review is overblown for a 10-person Verein, but filling them is trivial. |
| V2 | Schwellenwerte in §5 IKS | **SIMPLIFY** | Pick numbers off the cuff (e.g. 4-Augen ab €500, Belegpflicht ab €25) and write them in. Don't draft a policy. |
| V3 | Schulungsprotokoll | **DROP** | "Andy schult Andy" is not a meaningful artefact. Replace §9 with one sentence: "Bei einem Vorstand-Wechsel führt der ausscheidende Kassenwart eine Einführung mit dem Nachfolger durch." Move on. |
| V4 | §10 Risikomanagement annual review | **DROP** | Annual risk reviews for a party-throwing Verein are paperwork that exists to be paperwork. |
| V5 | §11 Steuerberater contact | **DEFER** | Issue. Fill when Verein actually retains one. Until then `n/a` is honest. |
| V6 | §12 Unterschriften | **DEFER** | Sign when Steuerberater is engaged or BMF asks. Not before. |
| V7 | DPA tracker statuses → `signed` | **KEEP** | Two lines change after L1+L2. |

### Recurring cadences

| Item | Bucket | Why |
|---|---|---|
| Weekly verify audit-anchor | **DROP** | Anchor is dropped (O2). |
| Monthly verify backups exist | **SIMPLIFY** | Replace with: UptimeRobot pings `/api/health/backup-age` (a new 10-line endpoint that returns 503 if the latest Drive backup > 36h old). Push, don't pull. |
| Quarterly restore drill | **DROP** | Solo dev hobby project. Annual at most. Replace with "before each Festschreibung year-close, verify Neon PITR window covers the close date." |
| Annually rotate SESSION_SECRET | **KEEP** | Cheap, valuable, every 12-24 months. |

---

## Additional items from the synthesis backlog (Round F + out-of-scope)

| Item | Bucket | Why |
|---|---|---|
| Sentry / monitoring buy-in | **DROP** | See O9. |
| Sammelbestätigung | **DEFER** | Issue. Trigger: first donor asks for one. |
| Real EÜR PDF matching ELSTER | **DEFER** | Trigger: first BMF query, or revenue > €25k threshold for full-EÜR-Pflicht. |
| Full GoBD-Z3 schema validation | **DROP** | Z3-export is required if BMF requests it; the format is documented; you can generate it ad-hoc if asked. Pre-building it costs weeks and saves nothing. |
| `/api/search` actual implementation | **DEFER** | Hide the search bar until built. NICE finding in Julia's protocol. |
| Service-account migration for Drive (HIGH-5) | **DROP** | One-developer hobby app pointing at Andy's Drive. A service account adds complexity without changing the trust boundary — Andy is already the single point of failure. |
| Signed commits on audit-anchor (HIGH-6) | **DROP** | Anchor is dropped. |
| Verify dump TOC after upload (HIGH-4) | **SIMPLIFY** | Once a year, manually decrypt + `pg_restore --list` the latest. Don't automate. |
| SLO doc (LOW-5) | **DROP** | A 10-person Verein doesn't have an SLO. Availability target: "whenever Andy notices it's down." |
| Release tagging convention (LOW-6) | **DROP** | Vercel tracks deploys by commit SHA. Tags add no information. |
| `cron_runs` table for per-task telemetry (MED-7) | **DROP** | Premature observability. |
| Vercel adapter dual-mode docs (MED-9) | **KEEP** | Already documented in CLAUDE.md; one comment in `svelte.config.js` and done. |

---

## What to permanently delete from MORNING.md / RUNBOOK.md / verfahrensdokumentation/*

**MORNING.md**
- §"Required human steps" item 6 (DPA gate already wired; keep the action item, drop the explanation).
- §"Open items for Andy" rows HIGH for `BACKUP_REPO` / `BACKUP_TOKEN` / `BACKUP_AGE_RECIPIENT` — drop them (we are no longer encrypting to a second GitHub repo).
- §"Recurring cadences" if it exists — replace with the four-line table above.

**RUNBOOK.md**
- §1.5 "Re-key BACKUP_AGE_RECIPIENT" — **delete entire section**. Drive-only backup, no age encryption.
- §2.1 Option C ("restore from Drive") — keep, this is now the canonical path.
- §2.1 Option B ("restore from age-encrypted dump in fdw-backups") — **delete**.
- §4 "Investigate Audit Chain Break" — keep the SQL but cut the "notify legal + BMF" section. Replace with: "If you see a chain break, e-mail Steuerberater (when engaged) and Vorstand. Restore from Neon PITR to a time before the suspected tamper."
- Any "annual rotate age key" / "decrypt 3-month-old dump quarterly" cadence — **delete**.

**docs/verfahrensdokumentation/**
- `09-mitarbeiter-schulung.md` — **collapse to one paragraph**. No employees → no training programme.
- `10-risikomanagement.md` — **collapse to a 5-row table** (Datenpanne, Vorstand-Wechsel, Neon-Ausfall, Drive-Ausfall, Andy-AFK) with one sentence each.
- `11-notfall-konzept.md` §11.3 RPO/RTO table — drop the "audit-log off-Postgres anchor" row.
- `12-unterschriften.md` — keep the file but stop treating it as blocking. Sign when there's a reason.
- `02-dv-systemumgebung.md` §2.7 "Restore-Test: täglich in CI" — **change to "annual manual drill"**. Daily restore-smoke against a fake schema is theatre (ops CRIT-1) and a real daily restore is wasteful.

**`.github/workflows/`**
- `audit-anchor.yml` — **delete the workflow file**.
- `db-backup.yml` — keep, but strip the GitHub-repo push step and the age-encryption step. Drive upload only.

---

## Bucket tallies

| Bucket | Count |
|---|---|
| KEEP | 12 |
| DEFER | 7 |
| DROP | 14 |
| SIMPLIFY | 11 |
| **Total classified** | **44** |

## Top 3 things to DROP entirely

1. **Off-Postgres audit-log anchor** (whole `audit-anchor.yml`, weekly cadence, signed-commits work, dual-witness Drive copy). The threat model — Neon-owner-level attacker who simultaneously rewrites the WAL and isn't caught by Andy logging in — does not exist for a 10-person Verein. Neon PITR is your anchor. Saves the entire `AUDIT_ANCHOR_*` secret plumbing, weekly cron, and the "verify the anchor ran" recurring task.
2. **Sentry + required-status-checks on `main`**. Solo developer means no PR reviewers to gate against; CI signal is already visible. Sentry's noise budget on a < 50 tx/month app is mostly false-positive cleanup work. Replace with a single free UptimeRobot ping on `/healthz`.
3. **Quarterly restore drill + monthly old-dump decrypt + Schulungsprotokoll**. These are recurring tasks that exist to satisfy a process audit that will never happen. Schulungsprotokoll for an org with zero employees is nonsense; quarterly drills require a discipline a hobby project will not sustain, so the documented procedure rots and becomes worse than nothing.

---

## One-line philosophy

The 9-reviewer pass was excellent for a SaaS at €1M ARR. For a Verein where the worst-case data-loss scenario is "we forget who paid the Mitgliedsbeitrag and ask them in the Telegram group," the appropriate operational surface area is *whatever Andy can keep alive in 30 minutes a month*. Everything else is debt dressed as rigour.

## Report path

`/Users/andygriesbeck/Projects/private/folgederwolke/folgederwolke-app/docs/reviews/2026-05-19-pragmatic-rebalance-indie.md`
