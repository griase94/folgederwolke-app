# Good morning! ☀️ — folgederwolke-app build progress

> Updated by autonomous conductor at the end of each phase. Pending phases show as `⏳`.

## TL;DR

- Live (will be): https://folgederwolke-app.vercel.app
- GitHub: https://github.com/griase94/folgederwolke-app
- Public Auslagen form: `PUBLIC_FORM_ENABLED=true` (D4: accept ~€100–400/5yr risk)
- Sign in: `andy.griesbeck@gmail.com` (magic-link, Phase 1)
- Heartbeat: launchd `com.folgederwolke.heartbeat` + `caffeinate -dimsu`

## Phases

| #   | Status   | PR  | Notes                                                                                                                |
| --- | -------- | --- | -------------------------------------------------------------------------------------------------------------------- |
| 0   | ✅ green | #1  | Scaffold + Drizzle + healthz + CI + cloud + Vercel deploy (`folgederwolke-app.vercel.app/healthz` → `{db:"ok"}` 200) |
| 1   | ⏳       | —   | Schema (ADRs 0001–0010 minus 0011) + magic-link auth + mail templates                                                |
| 2   | ⏳       | —   | Public form + Drive upload + Eingangsmail                                                                            |
| 3   | ⏳       | —   | Admin shell + Mitglieder CRUD                                                                                        |
| 4   | ⏳       | —   | Audit Inbox + Importer + Mails                                                                                       |
| 5   | ⏳       | —   | Invoices + Transactions + CRM + Spenden                                                                              |
| 6   | ⏳       | —   | Importer + Dashboard + EÜR + Crons                                                                                   |
| 7   | ⏳       | —   | PWA + polish + sign-out + dsgvo panel                                                                                |
| 7.5 | ⏳       | —   | Compliance hardening + Phase 2 issues                                                                                |

## ⚠ Required human steps

1. Disable old Apps Script after Phase 6 importer (D5 hard cutover).
2. Set old Sheet to view-only for non-Vorstand.
3. Announce migration to Vereinsmitglieder.
4. (Optional) Engage lawyer for Datenschutzerklärung review.
5. (Optional) Engage Steuerberater for Verfahrensdokumentation sign-off.

## How to resume

If the conductor exited cleanly (context budget, end of phase), state is in `~/.folgederwolke-build/state/state.json`. To pick up from the next phase:

```bash
claude --settings ~/.claude/settings-autonomous.json --dangerously-skip-permissions --remote-control "folgederwolke-app-build"
```

Then paste the §16 prompt from `~/.claude/plans/deeply-familiarize-yourself-with-calm-biscuit.md`.

## How to abort

```bash
touch ~/.folgederwolke-build/state/ABORT
```

Subagents + conductor poll this file at every Bash call and on 60s intervals; they stop gracefully after the current step.

## Cost so far

See `~/.folgederwolke-build/state/state.json` `estimated_cost_eur`. Conductor PushNotifies at €1000 warning and €1500 hard stop.

---

## Phase 0 — completion log (2026-05-18)

**Status:** ✅ green
**PR:** [#1](https://github.com/griase94/folgederwolke-app/pull/1) — squash-merged into `main` as `625f184`
**Tag:** `phase-0-green`
**Production URL:** https://folgederwolke-app.vercel.app
**Healthz:** `https://folgederwolke-app.vercel.app/healthz` → `200 {"db":"ok","drive":"fail","sha":"dev","deployedAt":null}`
**Cost (approx):** €5 (3× Sonnet builders + orchestration)

**What's wired up:**

- GitHub repo `griase94/folgederwolke-app` (public) with branch protection on `main` (7 required checks: unit-and-types, build, e2e, semgrep, gitleaks, audit, reviewed-by-opus)
- Vercel project `prj_7DJNj5iU8sWP3CxmVCyb9RQPUFzQ` (org `andreas-griesbecks-projects`)
- 29 GitHub Action secrets pushed
- 27 Vercel env vars in production + preview, 8 in development (non-secret VEREIN constants only)
- SvelteKit 2 + Svelte 5 runes + Tailwind v4 + shadcn-svelte (zinc base, rosa primary `oklch(0.43 0.20 350)`)
- Drizzle ORM + postgres-js (lazy singleton — survives build-time SSR)
- Vitest + Playwright + happy-dom + stricter TS (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noImplicitOverride`)
- Dual adapter: `adapter-vercel` when `VERCEL=1`, `adapter-node` everywhere else (so `pnpm preview` + Playwright work)
- ESLint flat config + Prettier
- `.github/workflows/{ci,security}.yml` (3-job CI + semgrep/gitleaks/pnpm audit)
- `scripts/orchestration/{phase-checkpoint,circuit-breaker,cleanup,preflight-smoke}.sh`
- `docs/phase2-backlog.md` (19 deferred items for completeness-scanner)
- `docs/RUNBOOK.md` skeleton + `docs/adr/0001-year-derivation.md` stub

**Known caveats for downstream phases:**

- `drive:"fail"` in `/healthz`: expected — OAuth scope `drive.file` cannot read pre-existing files until Andy shares them with this OAuth app, or until Phase 5 redesigns `TEMPLATE_DOC_ID` (per masterplan §6.1).
- Workflow env names in `.github/workflows/ci.yml` use legacy `GOOGLE_CLIENT_ID` / `RESEND_API_KEY` — non-blocking (env.ts is defensive) but Phase 1 `ci-debugger` should rename to match the actual secret names (`GOOGLE_OAUTH_CLIENT_ID`, drop `RESEND_API_KEY` since we use SMTP).
- Hotfix commit `081a698` (dual-adapter) pushed directly to `main` AFTER PR #1 merge — branch protection's `strict` flag means any future PR will need to rebase past this commit. Phase 1 builders should `git pull` before branching.
- `SESSION_SECRET` is stored at `~/.folgederwolke-build/state/SESSION_SECRET` (mode 600). NOT persisted to `~/.env.folgederwolke-app-bootstrap` (Andy's deny rule blocks writes to that path).

**To resume → Phase 1:**

```bash
claude --settings ~/.claude/settings-autonomous.json --dangerously-skip-permissions --remote-control "folgederwolke-app-build"
```

Paste the §16 prompt verbatim from `~/.claude/plans/deeply-familiarize-yourself-with-calm-biscuit.md`. The state file at `~/.folgederwolke-build/state/state.json` has `last_completed_phase: "0"` — the new conductor session will branch `phase-1-schema-auth-mail` from `main` and spawn `schema-author` (Opus), `mail-core` (Sonnet), `theme-author` (Sonnet), then sequentially `auth-integration` (Opus) per §10.6 + §10.6.5.

---

🤖 Autonomous build: https://github.com/griase94/folgederwolke-app / Masterplan: `~/.claude/plans/deeply-familiarize-yourself-with-calm-biscuit.md`
