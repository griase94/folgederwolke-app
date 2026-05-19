# Reviews

Independent reviewer reports against the folgederwolke-app codebase. Each report is a frozen snapshot of findings at a point in time; the linked review-driven commits then close (or document why they cannot close) each item.

## 2026-05-19 — pre-merge review of Phase 7.5 (PR #29)

Andy asked for "extensive reviews and then also the fixes to be extensive" before merging Phase 7.5. Nine reviewers ran in parallel: a Julia-persona user reviewer (extensive UX testing against the live dev server), a test-coverage reviewer, and seven domain reviewers. Synthesis + fix plan in [`2026-05-19-synthesis-fix-plan.md`](./2026-05-19-synthesis-fix-plan.md). 252 findings total, 36 CRIT-level.

| Reviewer | Report | Findings | CRIT |
| --- | --- | --- | --- |
| **Julia** (user UX, persona test) | [protocol](./2026-05-19-julia-user-protocol.md) + [raw findings JSON](./2026-05-19-julia-findings.json) + [screenshots](./2026-05-19-julia-screenshots/) | 46 | 11 MUST |
| **Test coverage** | [report](./2026-05-19-test-coverage-review.md) | 56 (35 gaps + 9 false-positive tests + 12 CI recs) | — |
| **Security** | [report](./2026-05-19-security-review.md) | 28 | 4 |
| **Schema / migrations** | [report](./2026-05-19-schema-review.md) | 26 | 2 |
| **DSGVO / legal** | [report](./2026-05-19-dsgvo-legal-review.md) | 34 | 8 launch-blockers |
| **Audit-chain crypto** | [report](./2026-05-19-audit-chain-review.md) | 21 | 5 |
| **Ops / backup / runbook** | [report](./2026-05-19-ops-review.md) | 29 | 6 |
| **UX / visual design** | [report](./2026-05-19-ux-design-review.md) + [screens](./screens/) | 50 | 4 |
| **Money / business logic** | [report](./2026-05-19-money-business-review.md) | 28 | 5 legal-risk |

### Julia's verdict (verbatim)
> No, she would not run the Verein's finances on this tomorrow — 4 of 10 admin pages plus the public form are broken. But the concept and the polished parts (dashboard, mobile, security hygiene) are clearly built with care; fix the 500s and the legal pages and it's better than the Excel status quo.

### Fix tracking

Round-by-round commits driven by this review pass (`git log --oneline`):

| Round | Commit | Scope |
| --- | --- | --- |
| Round A | `cf9c536` (later squashed into Phase 7.5) | Session security + legal placeholders + sign-out + tailwind typography |
| Round B | `a7ee5a0` | Mail templates Gmail-safe, German copy, session re-check, audit surfaced |
| Round C | `f9f7ddb` | Money/legal artifact correctness + env merge order |
| Round D | _planned_ | DB schema migration 0010 (chain hash recipe, REVOKE-aware DSGVO, FK fixes, Festschreibung trigger) |
| Round E | _planned_ | Tests + CI gates to prevent regressions |
| Round F | _Andy's todo_ | Ops (DPAs, backup secrets, monitoring) — see MORNING.md |

### Reproducing the Julia review locally

The Julia agent generated three Playwright specs and a separate config that exercise the live dev server:

```bash
pnpm dev                                      # http://127.0.0.1:5175
pnpm exec playwright test \
  --config playwright.julia.config.ts \
  tests/e2e/julia-review*.spec.ts \
  --reporter=line
```

Findings are emitted as `docs/reviews/2026-05-19-julia-findings*.json` so the protocol can be regenerated on demand.
