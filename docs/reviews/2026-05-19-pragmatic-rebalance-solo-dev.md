# 2026-05-19 — Pragmatic Rebalance: What a Solo Dev Will Actually Maintain

**Reviewer lens:** Senior dev who has watched too many side projects die not from bugs but from process bankruptcy. The maintainer doesn't stop because the code is bad — they stop because Sunday afternoon arrives and the RUNBOOK says it's time for the "monthly backup verification + quarterly restore drill + annual key rotation + Verfahrensdoku review," and now the project feels like a second job. So they don't open the repo. And then they don't open it next week either. And then it's three months later and they're embarrassed.

This Verein has ~10 members. Andy is the only dev, in his spare time. The 9-reviewer pass landed a checklist that would be appropriate for a 5-person SaaS startup with on-call rotation. It is not appropriate here. Let's cut it down to what survives contact with reality.

---

## 1. Cadence reality check

| Item                              | Reality verdict        | Why                                                                                                                                                                       |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Weekly anchor verification        | **THEATRE**            | Andy will check it for ~6 weeks. Then he won't. Nobody will notice. The whole anchor mechanism is forensic — it matters in the 0.1 % case of "we were hacked and need to prove which rows are originals to the Finanzamt." A 10-member Verein is not getting hacked by a sophisticated actor. Drop the weekly ritual. Keep the workflow if you want, but stop pretending it's an operational duty. |
| Monthly backup verification       | **AUTOMATE-OR-DROP**   | "Andy opens GitHub Actions, scrolls, and visually confirms green for 30 days" is the most skippable possible task. Either automate a "no backup in 48h → email Andy" alert, or accept that you'll learn the backups stopped when you next need one. |
| Quarterly restore drill           | **THEATRE**            | Solo dev with a day job will not give up a Saturday to restore a Neon dump into a scratch branch on a working system. They'll do it once after the review, feel virtuous, then never again. **Accept**: if a real restore is needed, it's a Saturday-figuring-it-out problem. That's the correct trade for a 10-person Verein with no external grants. |
| Annual SESSION_SECRET rotation    | **THEATRE**            | Nobody rotates session secrets annually on a hobby project without an attack signal. Set a calendar reminder. Don't pretend it's a policy. |
| Annual Google OAuth refresh       | **REAL-ish**           | Google forces re-consent at unpredictable intervals; you'll be reminded by a broken backup. So it's "as-needed" not "annually." |
| Sentry alert triage               | **REAL** if you have it| You will look at Sentry when your phone vibrates. You will not look at Sentry on a schedule. Configure email alerts, no dashboard ritual. |
| Branch-protection audit           | **DROP**               | "Monthly verify GitHub branch-protection settings haven't drifted." Settings don't drift on their own — they change when *you* change them. Audit on change, not on a clock. |
| Verfahrensdoku annual review      | **REAL** (low effort)  | This is one hour, once a year, and the Finanzamt may genuinely ask. Set a calendar reminder tied to year-end Festschreibung — same session. |
| DSGVO doc updates                 | **REAL** (event-driven)| Only triggered when something actually changes (new processor, new data category, new mail provider). Not on a clock. Don't put a quarterly reminder. |

**The theme**: every cadence that is "open dashboard X, visually confirm Y" will be skipped within 2 months. Only **(a) automated alerts that ping you when something is wrong** and **(b) tasks that piggyback on something you were already doing** survive long-term.

---

## 2. Day-1 checklist: 25 items → 5

The current ops review lists ~25 Day-1 todos across backups, audit-anchor, CI/CD gating, migration safety, the public-form gate, monitoring, contacts, and restore-smoke. For a solo dev with a Sunday afternoon, here is what actually fits:

### THE 5-ITEM MINIMUM DAY-1 LIST

1. **Flip `PUBLIC_FORM_ENABLED` default to `false` in `env.ts`** and require explicit `true` in Vercel env. This is a 3-line code change and closes the inverse-safe-default risk. (ops CRIT-2) — leave the `DPA_GATE_PASSED` gate as a Vercel env check only; don't add a second code constant.
2. **Wire `pnpm tsx scripts/migrate.ts` into the Vercel build command.** One line in `vercel.json`. No GitHub-Actions migration job, no boot-time schema check. (ops CRIT-5)
3. **Set the existing Neon PITR as the entire backup story for now.** Verify the Neon plan (Launch = 7 days history is fine for ~10 members). Record "Neon plan = Launch" in RUNBOOK. **Don't set up the GitHub-repo + Drive + age-encryption pipeline.** Defer to issue #30 alongside encryption.
4. **One uptime check on `/healthz` → email to andy.griesbeck@gmail.com** (UptimeRobot or BetterStack free tier, 5-min interval). One signal, one channel. No Sentry, no log drain, no Discord webhook.
5. **Fill the Notfall-Konzept contact placeholders** with Andy's real phone + 1 backup person's name & phone (could be his partner, the Vorstand, anyone reachable). Without this the Notfallkonzept is legally void under DSGVO Art. 32. 10 minutes of typing.

**Total time**: one Sunday afternoon. Genuinely.

### Everything else: defer or drop

| Original Day-1 item                                       | Verdict                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Create `fdw-backups` private repo                         | Defer to issue #30 (encryption track)                                                            |
| Generate age keypair, store in 1Password                  | Defer to issue #30                                                                               |
| Set 7 GitHub Action secrets                               | Defer — they're for the backup pipeline that's deferred                                          |
| Manually run + verify db-backup.yml                       | Defer                                                                                            |
| Run real restore drill, record RTO                        | DROP. You won't do it. Document "RTO is whatever Neon PITR is, plus a Saturday."                 |
| Audit-anchor secrets + signed commits + OpenTimestamps    | Defer to issue #30 (or DROP — the whole anchor story is overkill for 10 members)                 |
| Branch protection on `main` (7 required checks)           | Reduce to 1-of-1 — only `unit-and-types` required. Andy is solo; "1 review" can't be met anyway. |
| Vercel "required checks before deploy"                    | Skip. Vercel already won't promote a failed CI build with default GitHub integration.            |
| Boot-time schema-version check                            | DROP. Migrate-on-build (item 2) makes this unnecessary.                                          |
| Verify schema matches committed migrations (`drizzle_migrations` query) | One-time check — do it inside item 2's verification, not as a separate todo.       |
| Sentry, Vercel Log Drain, Discord webhook                 | Skip until you actually have users / actually have an incident                                   |
| Rewrite `restore-smoke.sh` to use real schema             | Defer. The current smoke test is theatre but cheap; rewriting it doesn't change reality.         |
| `docs/SECRETS.md`                                         | Skip. You're the only secret-holder. Put the list in 1Password.                                  |
| Steuerberater contact in RUNBOOK §4.4                     | Defer to "first time you actually engage one"                                                    |
| Fill all `<!-- FILL -->` in Verfahrensdoku                | Reduce: only fill Kassenwart name + Schwellenwert. The rest is finance-bureaucratic narrative that won't be read until the Finanzamt actually asks. |

---

## 3. The minimum operational setup: 80 % value, 20 % toil

Concrete proposals:

- **Backups = Neon PITR. That's it.** Until the Verein has >30 members or external grants, the threat model does not justify a four-destination encrypted pipeline. Neon's 7-day PITR window covers every realistic loss scenario (Andy fat-fingers a delete, a migration goes sideways, ransomware in his dev environment). The GitHub-repo + Drive + age-encryption story exists because someone imagined a "Neon company implodes" scenario; that's a 0.01 % event whose cost is "rebuild the dataset from this year's bank statements and member spreadsheets" — bad, but not existential.
- **Monitoring = UptimeRobot pinging `/healthz` → email.** No Sentry. When your email pings, you check. When it doesn't, you don't.
- **Migration safety = run in `vercel build`.** If migration fails, the build fails, the deploy doesn't promote. End of problem. Skip the boot-time check, skip the GitHub Actions migration job.
- **Audit anchor = drop the weekly off-Postgres push.** Keep the in-DB hash chain (the trigger is already in place; it costs nothing to keep). The chain itself is the tamper evidence, audited from the DB. The "off-Postgres witness" is a forensic luxury for a 10-member Verein.
- **Branch protection = require `unit-and-types` only.** You are the reviewer, the dev, and the merger. Stop pretending you have a team.
- **CI required checks for prod deploy = same.** `unit-and-types` is enough. `e2e` is great to have, but if it flakes on a Sunday and you can't fix it, you'll just push to `main` anyway.
- **Verfahrensdoku = fill once, review at year-end Festschreibung.** Same session, same hour. Tie the cadence to a thing you have to do anyway (taxes).

---

## 4. Honest one-line pushbacks for the todos you'll feel guilty about dropping

- **Quarterly restore drill** → *You will not actually do this. Skip it. If you ever need a restore you'll spend a Saturday figuring it out — that's the right trade.*
- **Annual SESSION_SECRET rotation** → *You will not actually rotate this annually unless something forces it. Set a one-line iCal reminder with no other ceremony.*
- **Sentry integration** → *You don't have enough users for Sentry to find anything you wouldn't find by reading the Vercel function logs when you happen to look. Skip until you have either >30 active users or a real production incident.*
- **Branch protection with 7 required checks** → *Branch protection is for teams. You are not a team. Require the one check that catches the dumbest mistakes (typecheck) and let yourself merge.*
- **Discord/Slack webhook for audit-chain breaks** → *Audit-chain breaks happen if someone with `app_runtime` privileges goes rogue. Nobody has those privileges except your deployed code. You will know about chain breaks because you wrote the bug that caused them.*
- **Signed commits on the audit-anchor repo** → *Nobody is going to attempt the audit-anchor-commit-rewrite attack on a 10-member Verein.*
- **OpenTimestamps as a witness for the anchor** → *Same.*
- **Monthly decrypt-an-old-dump-to-catch-bit-rot** → *You don't have old dumps because backups are Neon PITR. Problem dissolved.*
- **Weekly check `gh run list --workflow=db-backup.yml -L 7`** → *You won't do this. If you really want a signal, set the workflow to email you on failure (it already does, by default, for the repo admin).*
- **Re-verify DPAs still signed quarterly** → *DPAs don't un-sign themselves. Re-verify when the processor sends a notification or when you're already in their dashboard for something else.*
- **Rotate `BACKUP_TOKEN` and `AUDIT_ANCHOR_TOKEN` quarterly** → *These don't exist yet (deferred to #30). When they do, set them with no expiry and rotate on suspicion.*

---

## 5. Anti-checklist: what to permanently remove from RUNBOOK.md, MORNING.md, and the Verfahrensdoku

### `docs/RUNBOOK.md`

- **§1.1 SESSION_SECRET rotation** — keep the procedure (it's useful when actually needed), but remove any annual-cadence framing. It's an "as-needed" procedure, not a calendar item.
- **§1.2 GOOGLE_OAUTH_REFRESH_TOKEN rotation** — same: remove "annually," mark as "when Google forces re-consent or the token stops working."
- **§1.5 BACKUP_AGE_RECIPIENT rotation** — delete entirely until issue #30 ships encryption.
- **§2.1 Option B (pg_dump restore from GitHub backup repo)** — delete entirely. Backups live in Neon PITR; the GitHub backup repo doesn't exist yet.
- **§2.1 Option C (Restore from Google Drive)** — delete, same reason.
- **§2.2 Post-restore checklist line "Audit chain integrity verified (§4)"** — keep the SQL but fix the broken `canonical_json()` reference (ops MED-6). Don't pretend this is a regular operation.
- **§4.1 SQL block** — currently broken (uses a `canonical_json()` function that doesn't exist). Either fix it or replace with a one-line `pnpm tsx scripts/verify-audit-chain.ts` and write the actual script. Don't leave broken SQL in the runbook — it's worse than no SQL.
- **§5.3 "Run restore smoke test locally"** — delete. The smoke test is theatre (CRIT-1: doesn't use the real schema). Rewriting it is deferred.

### `MORNING.md`

- **The "Phase 7.5 status — one manual step left" section** — once Phase 7.5 is actually merged, delete this whole section. Outdated status banners are noise.
- **"⚠ Required human steps" items 4–7 (Sign Vercel DPA, Sign Neon DPA, Set DPA_GATE_PASSED, Fill Verfahrensdoku)** — collapse to a single line: "Before enabling the public form: sign Vercel + Neon DPAs in their dashboards and set `DPA_GATE_PASSED=true` in Vercel env." That's it. Don't link the same procedure three times.
- **"Open items for Andy" table at the bottom** — delete rows for `BACKUP_REPO`/`BACKUP_TOKEN`/`DRIVE_BACKUP_FOLDER_ID`/`BACKUP_AGE_RECIPIENT` (all deferred to #30). Delete the Steuerberater row (defer until first engagement).

### `docs/verfahrensdokumentation/`

- **`11-notfall-konzept.md` §11.3 — the "documented RPO/RTO" table** — bring the numbers in line with reality: Neon PITR is the entire story; remove rows for "Nightly age-encrypted pg_dump" and "Google Drive secondary copy" until issue #30 ships. The current table promises things that don't exist.
- **`10-risikomanagement.md` §10.4 "annual revision history" line** — replace "annual" with "at year-end Festschreibung." Same calendar event, no extra ritual.
- **`09-mitarbeiter-schulung.md`** — for a 1-person operation, this section is a fiction. Either delete it or compress to "Andy is the only operator; competence is maintained via [link to ADRs + RUNBOOK]." Don't pretend there's a training program.
- **`05-iks.md` Schwellenwerte placeholder** — pick a number (e.g., €500) and write it. Don't leave `<!-- FILL -->` as a permanent guilt-trip.
- **`12-unterschriften.md`** — leave open until you actually have a Steuerberater. Don't list this as a Day-1 item.

---

## Closing grumble

The instinct after a 9-reviewer pass is to do everything. Don't. Each cadence item you don't actually maintain is a small lie in your own documentation, and after enough of them accumulate the documentation itself becomes the thing you avoid looking at. Then you avoid the project. Then the Verein doesn't get its tool.

Ship the 5-item Day-1 list this weekend. Defer the rest to issue #30 or to the calendar event it should be tied to. Let yourself off the hook for things that don't matter at this scale — the audit-anchor weekly check, the quarterly restore drill, the monthly DPA re-verification. The 10 members of this Verein need a working app maintained by a non-burned-out human, not a perfectly-instrumented one maintained by nobody.
