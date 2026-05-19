# 2026-05-19 — Review Synthesis & Fix Plan

Nine reviewers ran in parallel: julia (user), test-coverage, security, schema, dsgvo-legal, audit-chain, ops, ux-design, money-business. **252 total findings, 36 CRIT-level**. This file is the consolidated fix plan.

## Cross-reviewer correlation — bugs found by ≥ 2 reviewers (highest confidence)

| Finding                                                             | Reviewers                                         | Severity                           |
| ------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------- |
| `[VEREIN_*]` placeholders unrendered on `/impressum`+`/datenschutz` | dsgvo CRIT-01, ux CRIT-2, julia MUST-5, ops MED-6 | CRIT                               |
| 4 admin pages crash (Mitglieder, Rechnungen, Projekte, Kunden)      | julia MUST-1, ux CRIT-4                           | CRIT — **FIXED** (migration drift) |
| 5 mail templates use `oklch()` + `linear-gradient`                  | ux CRIT-1, test CG-1, money MED                   | CRIT                               |
| `DPA_GATE_PASSED` not referenced in code                            | dsgvo CRIT-02, ops CRIT-2                         | CRIT                               |
| Audit chain hash recipe missing columns                             | audit-chain CRIT-01 (+ schema implications)       | CRIT                               |
| µs/ms timestamp drift in chain                                      | schema CRIT-F1, audit-chain LOW-02, test-cov CG-8 | CRIT                               |
| Advisory-lock key not namespaced                                    | schema CRIT-F2, audit-chain HIGH-01               | CRIT                               |
| Full IP in `actor_ip_prefix` field                                  | dsgvo CRIT-06, security HIGH-2                    | HIGH                               |
| Festschreibung no DB trigger                                        | money CRIT-4, test-cov CG-6                       | HIGH                               |
| `+layout.svelte` app.css import had no test                         | test-cov CG-4 + I hit this live                   | HIGH — **FIXED**                   |
| `sendMail({entity_id: null})` deduped via NULLS NOT DISTINCT        | test-cov CG-3 + I hit this live                   | HIGH — **FIXED**                   |
| `baseUrl` empty-string fallback still live                          | test-cov CG-2 + I introduced CRIT-2 fixing this   | CRIT — must fix safely             |

## Phase 7.5-specific defects

(All from the new audit-chain work)

- Hash recipe doesn't cover all stored columns (allows actor / business_id tampering) — audit-chain CRIT-01
- Anchor co-located with potential attacker (single PAT, unsigned, no second destination) — audit-chain CRIT-02
- Trigger not `SECURITY DEFINER`, search_path attack surface — audit-chain CRIT-03
- Verifier can't detect suffix truncation (no persisted chain head) — audit-chain CRIT-04
- Backfill orders by attacker-controllable `occurred_at` — audit-chain CRIT-05
- `pseudonymise()` blocked by REVOKE policy from same migration — dsgvo CRIT-03

## CRIT fix order (this PR)

### Round A — quick, contained, low-risk

1. Apply migrations 0004-0008 to live Neon (admin 500s) — **DONE**
2. SESSION_SECRET: enforce `.min(32)` in env.ts, throw at startup — security CRIT-1
3. Restrict `meta.origin` fallback (only in dev) — security CRIT-2 (my regression)
4. Substitute `[VEREIN_*]` placeholders in legal markdown loader — dsgvo CRIT-01, ux CRIT-2
5. Add `DPA_GATE_PASSED` to env schema + gate `PUBLIC_FORM_ENABLED` reading — dsgvo CRIT-02, ops CRIT-2
6. Install `@tailwindcss/typography` + register plugin — ux CRIT-3
7. Rewrite 5 mail templates with hex colors (no oklch/gradient) — ux CRIT-1, test CG-1
8. Fix `/sign-out` 500 (missing +page) + actually delete session — julia MUST-2
9. Translate "Check your inbox 💌" → German across 5 call sites — ux HIGH
10. `/api/search` auth guard — security HIGH-4
11. `+error.svelte` — don't echo raw error.message — ux HIGH
12. Map FAB/bell/search disabled affordances → hide if no impl — ux HIGH
13. IP prefix actually a /24 prefix (not full IP) — dsgvo CRIT-06, security HIGH-2

### Round B — code logic fixes

14. `isAdminEmail` re-check on `resolveSession` — security CRIT-3
15. Email enumeration: match admin-path timing in non-admin branch — security CRIT-4
16. Public form action: don't swallow audit handler failures — security HIGH-1
17. Public form: validate body shape, return `fail(422)` not 500 — julia MUST-3
18. `/app/dsgvo`: extend `collectAuskunft` to query expenses + redact extern\_\* — dsgvo CRIT-04
19. `/app/dsgvo`: rewrite `pseudonymise` to not write to `audit_log` (Phase 7.5 REVOKE) — dsgvo CRIT-03
20. DSE v2: add Spenden section, fix Vorarbeit notice, fix VVT bases — dsgvo CRIT-05, CRIT-08
21. Three DSGVO contact emails: pick one — dsgvo HIGH
22. `bezahlt_von_display` redaction in dsgvo functions — dsgvo HIGH

### Round C — money / legal artifacts

23. Bescheinigung: signature line + §50 EStDV hint — money CRIT-1
24. `maskOrtFromAdresse`: handle multi-line VEREIN_ADRESSE — money CRIT-2
25. SEPA: upgrade pain.001.001.09 schema + bigint arithmetic for CtrlSum — money CRIT-3
26. Bescheinigung: stop transliterating umlauts (WinAnsi supports them) — money HIGH
27. Invoice `leistungsDatum` required when missing → § 14 UStG fix — money HIGH
28. WGB-Freigrenze widget: update §64 Abs. 3 AO threshold to €50.000 (2025+) — money CRIT-5
29. `formatEurCents` / `eurAmount` / `centsToEurStr`: bigint string formatting, no float coercion — money HIGH

### Round D — DB & audit chain

30. Migration 0010: add `audit_log_last_chain_head` to settings — audit-chain CRIT-04
31. Migration 0010: extend hash recipe to all columns (including id, actor_kind, etc.) — audit-chain CRIT-01
32. Migration 0010: trigger `SECURITY DEFINER` + `SET search_path = ''` — audit-chain CRIT-03
33. Migration 0010: advisory-lock key namespacing (two-arg `pg_advisory_xact_lock(ns, key)`) — schema CRIT-F2
34. Migration 0010: µs handling — truncate `occurred_at` to ms before hashing — schema CRIT-F1
35. Migration 0010: `audit_log.actor_user_id` ON DELETE SET NULL → RESTRICT — dsgvo CRIT-07
36. Migration 0010: `auslagen_submissions.decided_by_user_id` + `approved_expense_id` FKs — schema HIGH-F3
37. Migration 0010: Festschreibung DB-level enforcement trigger — money CRIT-4
38. Migration 0010: missing CHECK constraints (donations Aufwandsspende, invoices brutto math, drive_status enum, id_counters.kind) — schema MED
39. Migration 0010: index donations.kategorie_id — schema HIGH-F5
40. Migration 0010: `audit_log.chain_seq` UNIQUE, not plain btree — schema HIGH-F6
41. Backfill script: use `id` as tie-break (not occurred_at) — audit-chain CRIT-05

### Round E — tests + CI gates

42. Add ESLint custom rule / Semgrep check: no `oklch()` / `linear-gradient(` in mail templates
43. Add Vitest assertion: layout import has `app.css`
44. Add Vitest assertion: `sendMail()` callers never pass `entity_id: null`
45. Add Playwright assertion: every public route loads computed CSS (non-zero font-size)
46. Add Postgres CI test: 0009 trigger fires on INSERT, blocks UPDATE/DELETE/TRUNCATE from app_runtime
47. Add Playwright test: `/app/*` redirects to /sign-in for unauthenticated
48. Add chain verifier integration test: insert real audit row, tamper, expect detection
49. Add mail-template Gmail-strip-simulation test (strips `style="…oklch…"`)
50. Backfill `__drizzle_migrations` rows for 0004-0009 so future runs don't re-attempt

### Round F — ops (these need Andy's input; document in MORNING.md)

51. Configure BACKUP_REPO + BACKUP_TOKEN + DRIVE_BACKUP_FOLDER_ID + BACKUP_AGE_RECIPIENT — ops CRIT-3
52. Sign Vercel + Neon DPAs — ops + dsgvo HIGH
53. Set up Sentry / uptime monitor — ops CRIT-4
54. Wire migration to Vercel build/postdeploy hook — ops CRIT-5
55. Fill `<!-- FILL -->` in Verfahrensdoku — dsgvo HIGH, ops CRIT-6

## Out of scope for this PR (Phase 2 backlog)

- Sammelbestätigung (money HIGH)
- Real EÜR PDF matching ELSTER (money HIGH)
- Full GoBD-Z3 schema validation (money HIGH)
- `/api/search` actual implementation (currently stub)
- Sentry / monitoring buy-in (depends on Andy's choice)
