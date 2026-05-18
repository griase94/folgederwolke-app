# Good morning! ☀️ — folgederwolke-app build progress

> Updated by autonomous conductor at the end of each phase. Pending phases show as `⏳`.

## TL;DR

- Live (will be): https://folgederwolke-app.vercel.app
- GitHub: https://github.com/griase94/folgederwolke-app
- Public Auslagen form: `PUBLIC_FORM_ENABLED=true` (D4: accept ~€100–400/5yr risk)
- Sign in: `andy.griesbeck@gmail.com` (magic-link, Phase 1)
- Heartbeat: launchd `com.folgederwolke.heartbeat` + `caffeinate -dimsu`

## Phases

| #   | Status   | PR  | Notes                                                                 |
| --- | -------- | --- | --------------------------------------------------------------------- |
| 0   | ✅ green | #1  | Scaffold + Drizzle + healthz + CI + cloud wiring                      |
| 1   | ⏳       | —   | Schema (ADRs 0001–0010 minus 0011) + magic-link auth + mail templates |
| 2   | ⏳       | —   | Public form + Drive upload + Eingangsmail                             |
| 3   | ⏳       | —   | Admin shell + Mitglieder CRUD                                         |
| 4   | ⏳       | —   | Audit Inbox + Importer + Mails                                        |
| 5   | ⏳       | —   | Invoices + Transactions + CRM + Spenden                               |
| 6   | ⏳       | —   | Importer + Dashboard + EÜR + Crons                                    |
| 7   | ⏳       | —   | PWA + polish + sign-out + dsgvo panel                                 |
| 7.5 | ⏳       | —   | Compliance hardening + Phase 2 issues                                 |

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

🤖 Autonomous build: https://github.com/griase94/folgederwolke-app / Masterplan: `~/.claude/plans/deeply-familiarize-yourself-with-calm-biscuit.md`
