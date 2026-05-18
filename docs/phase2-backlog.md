# Phase 2 Backlog

> These are intentional deferrals from v1. The completeness-gap-scanner uses this file to distinguish intentional cuts from actual gaps. Items listed here should NOT be flagged as missing features during phase reviews.

Source: masterplan §15. Auto-filed as detailed GH issues by Phase 7.5's `phase2-issue-creator` agent.

| #   | Issue title                                                                                       | Source                              | Effort estimate  |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------- |
| 1   | feat(public-form): photo-first capture with Claude Haiku OCR pre-fill                             | D8 round-1 UX                       | M (4-6h)         |
| 2   | feat(admin): Cmd-K palette desktop keyboard shortcut (federated entity search)                    | D8 round-1 UX                       | M (3-5h)         |
| 3   | feat(invoice): live PDF preview (vs current live HTML + "Generieren" button)                      | D8 round-4 UX                       | L (6-8h)         |
| 4   | feat(treasurer): weekly Monday-morning digest mail                                                | D8 round-1 UX                       | S (2-3h)         |
| 5   | feat(public-form): multi-receipt batch flow ("just got back from event with 4 receipts")          | D8 round-1 UX                       | M (4-5h)         |
| 6   | feat(admin): auto-approve trusted-member small-amount expenses                                    | D8 — gated on Vereinsordnung review | S (2-3h)         |
| 7   | feat(donations): Aufwandsspende workflow with BMF-compliant consent modal                         | D9 round-1 Steuerberater            | M (4-6h)         |
| 8   | feat(accounting): post-Festschreibung sphere_overrides table + effective_sphere()                 | D11 round-4 DB                      | M (3-4h)         |
| 9   | feat(public-form): submitter device-recognition cookie with TTDSG-compliant consent banner        | D12 (kept dropped from v1)          | S (2-3h)         |
| 10  | feat(admin): in-app notification bell `/app/notifications`                                        | round-1 UX                          | S (2-3h)         |
| 11  | feat(transactions): anomaly detection ("this expense is 3× larger than usual for this kategorie") | round-1 UX                          | M (3-4h)         |
| 12  | feat(notifications): Web Push for admin "new Auslage"                                             | round-1 mobile                      | M (4-5h)         |
| 13  | feat(integrations): Slack/Telegram webhook for admin notifications                                | round-1 UX                          | S (2-3h)         |
| 14  | feat(public): manual "re-send Eingangsmail" button                                                | round-1 ops                         | S (1-2h)         |
| 15  | chore(deploy): custom domain `buchhaltung.folgederwolke.de` (CNAME)                               | scope                               | XS (15min + DNS) |
| 16  | feat(banking): MoneyMoney / FinTS webhook for auto-mark-paid                                      | round-1 UX, longer-term             | L (8-12h)        |
| 17  | feat(members): self-service member login (members see own Auslagen + Beitrag history)             | round-1 UX                          | M (4-6h)         |
| 18  | feat(admin): editable rejection mail templates in `/app/einstellungen/templates`                  | round-1 UX                          | S (2-3h)         |
| 19  | chore(security): migrate env-var bootstrap to 1Password `op://` references                        | post-launch credential hygiene      | S (2-3h)         |

Also explicitly **NOT shipping in v1 or v2**: dark mode, multi-language, multi-tenant, granular per-feature permissions (admin/non-admin binary stays).
