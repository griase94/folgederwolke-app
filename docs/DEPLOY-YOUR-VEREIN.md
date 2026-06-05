# 🪁 Deploy Your Verein

**Take this app, make it yours, and run it for your own Verein — in an afternoon.**

This app was built for one small German Verein (_Folge der Wolke e.V._). But there is
nothing FdW-specific baked into the code anymore — every name, address, bank detail,
legal page, and tax certificate is driven by configuration you control. This guide
walks you from an empty Vercel account to a live, logged-in, correctly-branded
Vereinsverwaltung.

> **Who this is for:** the one person in your Verein who's comfortable with a terminal,
> a GitHub account, and copy-pasting commands. You do **not** need to be a developer.
> If you can follow a recipe, you can do this.

> **How long it takes:** ~45 minutes of clicking and pasting, plus ~10 minutes of
> waiting for builds. Pour a coffee. ☕

---

## The map 🗺️

Here's the whole journey on one page. Each step has its own section below.

```
   ┌─────────────────────────────────────────────────────────────┐
   │  PART 1 — STAND IT UP  (get a live app, still says nothing)  │
   ├─────────────────────────────────────────────────────────────┤
   │  1. Fork the repo                                            │
   │  2. Create the database        (Neon)                        │
   │  3. Create the project         (Vercel)                      │
   │  4. Add a file store           (Vercel Blob)                 │
   │  5. Wire up email              (SMTP / Resend)               │
   └─────────────────────────────────────────────────────────────┘
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  PART 2 — MAKE IT YOURS  (your name, your law, your bank)    │
   ├─────────────────────────────────────────────────────────────┤
   │  6. Set your identity          (the VEREIN_* env vars)       │
   │  7. First deploy + migrate                                   │
   │  8. Become the admin                                         │
   │  9. Finish identity in-app     (Stammdaten + Beitrag)        │
   │ 10. Review your legal pages    (Impressum / Datenschutz)     │
   └─────────────────────────────────────────────────────────────┘
                              ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  PART 3 — POLISH  (optional, do it whenever)                 │
   ├─────────────────────────────────────────────────────────────┤
   │ 11. Donation receipts          (Zuwendungsbestätigung)       │
   │ 12. Logo, icons & colours       (branding)                   │
   └─────────────────────────────────────────────────────────────┘
```

If you only read one thing, read **[the two-tier config model](#-the-one-mental-model-that-makes-everything-click)** —
it's the single idea that explains why this app behaves the way it does.

---

## What you'll need 🧰

Five free (or near-free) accounts. Set them up first; you'll paste credentials from
each into Vercel later.

| Account                              | What it gives you                                                                                    | Cost for a ~15-person Verein |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| **GitHub**                           | Hosts your copy of the code; runs migrations + backups                                               | Free                         |
| **Vercel**                           | Runs the app; stores your config + uploaded receipts                                                 | Free Hobby tier is plenty    |
| **Neon**                             | Your Postgres database (scale-to-zero, EU region)                                                    | Free tier fits comfortably   |
| **An email sender**                  | Sends magic-login links + reminders. Any SMTP works; [Resend](https://resend.com) is the easy choice | Free tier ~3k mails/mo       |
| **Google Cloud** _(service account)_ | Read-only Sheets access for the `/healthz` check                                                     | Free                         |

> **🇪🇺 Data-protection note:** Vercel and Neon both offer EU regions and standard
> DPAs (Auftragsverarbeitungsverträge). This app pins Neon to `fra1` (Frankfurt) and
> Vercel functions to EU regions. Keep it that way — it's what your Datenschutzerklärung
> will promise your members.

---

## 🧠 The one mental model that makes everything click

Your Verein's identity lives in **two places**, and knowing which is which saves you
an hour of confusion:

### Tier 1 — Environment variables (set in Vercel)

These are the **bootstrap identity** and the **source of truth for legal pages**. You
set them once in Vercel's dashboard. They cover everything: name, address, bank, legal
contacts, tax data.

### Tier 2 — In-app Settings (the Stammdaten form)

Once your app is live and you log in as admin, **Settings → Stammdaten** lets you edit
your core master data (name, address, IBAN, BIC, Steuernummer, Vereinsregister-Nr)
right in the browser. The moment you save that form, **the database value wins** over
the env var for everything the app renders live — the EÜR, invoices, SEPA files, mail
footers, the donation receipts, and the app's own chrome.

So the rule is:

> **Env var = the value until someone saves the in-app form. After that, the form wins.**
> (For the fields the form covers. Everything else stays env-only — see the table below.)

### The one exception worth tattooing on your hand 🖊️

**The legal pages — `/impressum` and `/datenschutz` — are _prerendered_ at build time.**

That means they're frozen into static HTML when Vercel builds your app. They read the
**env var values as they were at build time** — they do _not_ read the in-app Settings
form, and they do _not_ update when you edit an env var later.

**→ If you change any `VEREIN_*` value that appears on a legal page, you must trigger a
redeploy** (push a commit, or hit "Redeploy" in Vercel) for the change to show up. A
plain env-var edit isn't enough for those two pages.

Why build it this way? Because legal pages that render from a live database can _crash_
(and ours did, once — a 500 on `/impressum` is both embarrassing and a §5 TMG problem).
Prerendering makes them physically incapable of failing at request time. Legal text
changes maybe once a year, so "redeploy to update" is a fine trade. We just want you to
know the rule so it never surprises you.

---

# PART 1 — Stand it up

The goal of Part 1: a live URL that loads, even though it doesn't say your Verein's
name yet. We'll give it a name in Part 2.

## Step 1 — Fork the repo

Fork `griase94/folgederwolke-app` into your own GitHub account (or clone + push to a
fresh private repo). Everything you'll do happens against **your** copy.

```bash
gh repo fork griase94/folgederwolke-app --clone
cd folgederwolke-app
pnpm install
```

> 💡 You can rename the repo to whatever you like (`meinverein-app`). The code doesn't
> care about its own repo name.

## Step 2 — Create the database (Neon)

1. Create a Neon project. **Pick the `eu-central-1` (Frankfurt) region.**
2. From the dashboard, copy two connection strings:
   - The **pooled** URL → this becomes `DATABASE_URL`
   - The **direct** (non-pooled) URL → this becomes `DIRECT_DATABASE_URL` and
     `NEON_MIGRATE_DATABASE_URL`

Keep these in a scratch file for a few minutes; you'll paste them into Vercel and GitHub.

## Step 3 — Create the project (Vercel)

1. In Vercel, **Add New → Project**, and import your forked repo.
2. Framework preset: **SvelteKit** (Vercel auto-detects it).
3. Don't deploy yet — it'll fail without env vars. Click through to the project, then
   **Settings → Environment Variables**. That's where Part 2 happens.

Install the Vercel CLI so you can set vars from your terminal (faster than the dashboard
for 20+ variables):

```bash
pnpm add -g vercel@latest
vercel login
vercel link        # connect this folder to the project you just created
```

## Step 4 — Add a file store (Vercel Blob)

Members upload receipt photos; those bytes live in Vercel Blob.

1. In your Vercel project: **Storage → Create → Blob**. Choose an **EU** region (`fra1`).
2. Connecting it auto-creates the `BLOB_READ_WRITE_TOKEN` env var.

That's the only storage step. (Locally and in tests the app writes to disk instead;
in production it's always Blob.)

## Step 5 — Wire up email

The app sends magic-link logins and a once-a-year Beitragsreminder. Pick a provider:

- **Easiest:** [Resend](https://resend.com) — sign up, verify your sending domain, set
  `MAIL_PROVIDER=resend`.
- **Classic SMTP:** any host works — set `MAIL_PROVIDER=smtp` plus
  `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD`.

You'll set these as env vars in Step 6. The from-address (`MAIL_FROM`) **must** be a
real address you control at your sending domain.

> ⚠️ `MAIL_PROVIDER=dev-eml` and `no-op` are **dev-only** — the app refuses to boot in
> production with either set. That's a guardrail, not a bug.

---

# PART 2 — Make it yours

This is the heart of the white-label. By the end of Part 2 your app loads, shows _your_
name everywhere, and you're logged in as its admin.

## Step 6 — Set your identity

Set these in **Vercel → Settings → Environment Variables** (Environment: **Production**),
or from the CLI with `vercel env add <NAME> production`. Group by group:

### 6a. Who you are _(required)_

| Variable                      | What it is                                                                              | Example                            |
| ----------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| `VEREIN_NAME`                 | Full legal name. Shown everywhere. **Boot fails in prod if empty.**                     | `Turnverein Musterstadt e.V.`      |
| `VEREIN_ADRESSE`              | Postal address. Use `\n` for line breaks.                                               | `Hauptstraße 1\n12345 Musterstadt` |
| `VEREIN_KONTAKT_EMAIL`        | Public contact email (Impressum + Datenschutz).                                         | `vorstand@meinverein.de`           |
| `PUBLIC_VEREIN_KONTAKT_EMAIL` | Same address, used in the public form's consent text. Set it to the same value.         | `vorstand@meinverein.de`           |
| `VEREIN_VORSTAND`             | Vertretungsberechtigter Vorstand (names). Appears on legal pages + cert signature line. | `Maria Muster, Hans Beispiel`      |

### 6b. Your registration & oversight _(required for the legal pages)_

| Variable                   | What it is                                                                                                                                                      | Example                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `VEREIN_REGISTERGERICHT`   | The court your Verein is registered at.                                                                                                                         | `Amtsgericht Musterstadt`                                                             |
| `VEREIN_VR`                | Your Vereinsregister number.                                                                                                                                    | `VR 1234`                                                                             |
| `VEREIN_AUFSICHTSBEHOERDE` | Your data-protection supervisory authority (full name + address). [Find yours here.](https://www.bfdi.bund.de/DE/Service/Anschriften/Laender/Laender-node.html) | `Bayerisches Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach` |

### 6c. Your bank _(required for invoices, SEPA, reminders)_

| Variable                | What it is                                                                                                      | Example                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `VEREIN_IBAN`           | Your Verein's IBAN.                                                                                             | `DE02120300000000202051` |
| `VEREIN_BIC`            | Matching BIC. _(The app refuses to boot if a known German IBAN and BIC name different banks — a typo-catcher.)_ | `BYLADEM1001`            |
| `VEREIN_BANK`           | Bank name, for display.                                                                                         | `Sparkasse Musterstadt`  |
| `VEREIN_STEUERNUMMER`   | Tax number, shown on mail footers + receipts.                                                                   | `123/456/78901`          |
| `VEREIN_KONTAKT_PERSON` | Person in the invoice footer (`℅ …`). Stable across treasurer changes.                                          | `Maria Muster`           |
| `VEREIN_CONTACT_PHONE`  | Phone in the invoice footer.                                                                                    | `+49 89 1234567`         |
| `VEREIN_FINANZAMT`      | **Full** Finanzamt name (keep the word "Finanzamt"). Used on donation receipts.                                 | `Finanzamt Musterstadt`  |

### 6d. Membership fee _(optional)_

| Variable                       | What it is                                                                                                           | Example |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------- |
| `VEREIN_BEITRAG_DEFAULT_CENTS` | Default yearly Mitgliedsbeitrag, **in integer cents**. `6900` = 69,00 €. Members can have individual amounts in-app. | `6900`  |

### 6e. The platform plumbing _(required)_

| Variable                          | What it is                                                                   | Example                         |
| --------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- |
| `DATABASE_URL`                    | Pooled Neon URL (from Step 2).                                               | `postgres://…`                  |
| `DIRECT_DATABASE_URL`             | Direct Neon URL (from Step 2).                                               | `postgres://…`                  |
| `SESSION_SECRET`                  | Signs login cookies. **Must be ≥ 32 chars.** Generate one below.             | _(random)_                      |
| `PUBLIC_BASE_URL`                 | Your canonical production URL. **Boot fails in prod if empty.**              | `https://meinverein.vercel.app` |
| `ADMIN_EMAILS`                    | Comma-separated emails that may self-promote to admin on first login.        | `du@meinverein.de`              |
| `MAIL_PROVIDER`                   | `smtp` or `resend`.                                                          | `resend`                        |
| `MAIL_FROM`                       | From-address of every mail. **Boot fails in prod if empty.**                 | `noreply@meinverein.de`         |
| `STORAGE_BACKEND`                 | `blob` in production.                                                        | `blob`                          |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | JSON key for a read-only Google service account. _(See note below.)_         | _(JSON blob)_                   |
| `CRON_SECRET`                     | Shared secret for the yearly reminder job. Generate like the session secret. | _(random)_                      |

Generate the two secrets:

```bash
# SESSION_SECRET and CRON_SECRET — run twice, use a different one for each
openssl rand -base64 48
```

> **🤔 "Do I really need a Google service account?"** Right now: yes — production boot
> currently requires `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` (it powers the `/healthz` Sheets
> probe and the one-time legacy importer). For a brand-new Verein with no Google Sheet
> this is busywork — create a service account with read-only Sheets scope, paste its
> JSON, and move on. _(If you want to drop this requirement entirely, it's a one-line
> change in `src/lib/server/env.ts` → `assertProductionEnvSafe()`, around the
> `if (!env.googleServiceAccount)` check. We flag it honestly rather than pretend it's
> free.)_

### 6f. Turn the public form on _(optional, do it later)_

| Variable              | What it is                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_FORM_ENABLED` | `true` lets non-members submit Auslagen via a public link. Defaults to **off** — a safe default. Flip it on once you've reviewed your legal pages. |

### Don't forget GitHub 🔑

Migrations and nightly backups run in **GitHub Actions**, not Vercel — so a couple of
secrets live there too:

```bash
# The migrate workflow needs the direct Neon URL (paste your own value):
export DIRECT_DATABASE_URL='postgres://…direct-neon-url…'
echo "$DIRECT_DATABASE_URL" | gh secret set NEON_MIGRATE_DATABASE_URL
```

The full secrets table (backups, age-encryption, etc.) is in
[`README.md` → Deploying to production](../README.md#deploying-to-production). For a
fresh fork you can skip the backup secrets until you're ready to harden.

## Step 7 — First deploy + migrate

Push to `main` (or hit **Redeploy** in Vercel). Two things happen automatically:

```
git push origin main
    ├─►  Vercel builds + deploys the app
    └─►  GitHub Actions applies your database migrations to Neon
```

Watch them:

```bash
gh run list --workflow=migrate.yml --limit 3     # migrations applied?
vercel ls                                        # recent deployments + their status (read-only)
```

…or just watch the Vercel dashboard — it shows the build live.

When both are green, open your `PUBLIC_BASE_URL`. You should see a sign-in page wearing
**your** Verein's name. 🎉

> **First-boot checklist** — if the deploy _fails to boot_, the error message tells you
> exactly which env var is missing (that's the `assertProductionEnvSafe` guard doing its
> job). The usual suspects: an empty `VEREIN_NAME`, `MAIL_FROM`, `PUBLIC_BASE_URL`, or a
> `SESSION_SECRET` under 32 characters.

## Step 8 — Become the admin

1. On the sign-in page, enter one of the emails you listed in `ADMIN_EMAILS`.
2. Check your inbox for the magic link (this also proves your mail setup works ✅).
3. Click it. You're in — as an admin.

If the mail never arrives, jump to [Troubleshooting](#-troubleshooting).

## Step 9 — Finish your identity in the app

Go to **Settings → Stammdaten**. You'll see your env values pre-filled, each tagged
_"currently from env"_. Review them, adjust if needed, and **Save**. From now on, these
database values drive your EÜR, invoices, SEPA exports, donation receipts, and mail
footers.

While you're in Settings, set your **Mitgliedsbeitrag** default if you didn't set
`VEREIN_BEITRAG_DEFAULT_CENTS`, and add your **Vorstand members** (they're the people
allowed to sign donation receipts).

## Step 10 — Review your legal pages 📜

Open `/impressum` and `/datenschutz` on your live site and **read them as a lawyer would.**
These are _your_ legal statements now.

- The **identity fields** (name, address, Vorstand, Registergericht, contact email,
  Aufsichtsbehörde) fill in automatically from your env vars. Confirm they're correct.
- The **list of data processors** in the Datenschutzerklärung (hosting = Vercel,
  database = Neon, mail provider, Google) is written for FdW's exact setup. **Edit it to
  match yours.** The text lives in
  `docs/legal/datenschutzerklaerung-versionen/` (newest `vN.md` file). An inline comment
  marks the processor block.
- Remember the [prerender rule](#the-one-exception-worth-tattooing-on-your-hand-): after
  editing legal env vars **or** the markdown, push a commit so the static pages rebuild.

> **🧑‍⚖️ This guide is not legal advice.** Impressum (§5 TMG) and Datenschutzerklärung
> (GDPR Art. 13) requirements depend on your specifics. When in doubt, have someone
> qualified read them. The app gives you correct _plumbing_; the _content_ is your
> responsibility.

---

# PART 3 — Polish

Everything here is optional and can wait until after you're live.

## Step 11 — Donation receipts (Zuwendungsbestätigung)

If your Verein is _gemeinnützig_ and issues tax-deductible donation receipts, fill in
your Freistellungsbescheid / §60a-Feststellung data. **Leave these empty if you don't
issue receipts** — the feature stays safely hidden.

| Variable                           | What it is                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `VEREIN_BESCHEID_TYP`              | `freistellungsbescheid` or `feststellung_60a`.                               |
| `VEREIN_BESCHEID_DATUM`            | Date the Bescheid was issued (`YYYY-MM-DD`).                                 |
| `VEREIN_SATZUNG_FASSUNG`           | Date of your Satzungsfassung (`YYYY-MM-DD`).                                 |
| `VEREIN_FREISTELLUNGSBESCHEID_VZ`  | Veranlagungszeitraum (year), only for `freistellungsbescheid`.               |
| `VEREIN_STEUERBEGUENSTIGTE_ZWECKE` | Your **exact** steuerbegünstigte Zwecke, copied verbatim from your Bescheid. |

> **⚠️ Get the Zwecke exactly right.** This text is printed on a legal tax document. The
> app deliberately ships **no default** here — if it's empty, receipt issuance refuses
> rather than guess. Copy the wording from your own Bescheid, character for character.

## Step 12 — Logo, icons & colours 🎨

The functional white-label (Parts 1–2) is done; this is cosmetic. These assets still
carry FdW's look and are swapped by hand for now:

| What                 | Where                                                                                        | Notes                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| App name / PWA title | `static/manifest.webmanifest`                                                                | Change `name`, `short_name`, `description`.                                                                               |
| Theme colour         | `static/manifest.webmanifest` (`theme_color`)                                                | FdW's is `#be185d`. Pick yours.                                                                                           |
| Home-screen icons    | `static/icons/icon-*.png` + `static/apple-touch-icon.png`                                    | Replace at the same sizes. The committed `*.svg` siblings are the source — swap those too, or your logo won't fully land. |
| Favicon              | `static/favicon.ico`, `static/favicon.svg`, `static/favicon-16.png`, `static/favicon-32.png` | Replace all four.                                                                                                         |
| iOS splash screens   | `static/splash/*.png`                                                                        | Optional; regenerate or delete.                                                                                           |

After swapping assets, push a commit to redeploy. _(Turning this into a one-command
`generate-branding` step from a single source logo is planned but not built yet — for
now it's a manual swap.)_

---

## 📋 Everything in one place: the env var reference

The complete list. The middle column means one specific thing — **does the process
refuse to start without it** — not "how important is it":

- 🛑 **Boot-blocks** — `assertProductionEnvSafe()` throws at startup; the deploy won't serve traffic until it's fixed.
- ⭐ **Required to function** — no startup throw, but the app (or the named feature) is broken without it.
- everything else — _recommended_ (correctness/legal completeness) or _optional_ (off by default).

<details>
<summary><b>Click to expand the full table</b></summary>

| Variable                                                                            | Refuses to boot / function?                                         | Drives                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- |
| `VEREIN_NAME`                                                                       | 🛑 boot fails if empty                                              | Everything: chrome, mail, legal, receipts   |
| `MAIL_FROM`                                                                         | 🛑 boot fails if empty                                              | From-address of all mail                    |
| `PUBLIC_BASE_URL`                                                                   | 🛑 boot fails if empty                                              | Absolute links in mail; magic-link security |
| `SESSION_SECRET`                                                                    | 🛑 boot fails if < 32 chars                                         | Login cookie signing                        |
| `STORAGE_BACKEND`                                                                   | 🛑 must be `blob` (`local-fs` throws)                               | Receipt file storage                        |
| `BLOB_READ_WRITE_TOKEN`                                                             | 🛑 boot fails when `blob` & unset                                   | Receipt file storage                        |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`                                                   | 🛑 boot fails if unset _(see Step 6e)_                              | `/healthz` + legacy import                  |
| `DATABASE_URL`                                                                      | ⭐ no data without it                                               | All data                                    |
| `DIRECT_DATABASE_URL`                                                               | ⭐ migrations fail without it                                       | Migrations                                  |
| `MAIL_PROVIDER`                                                                     | ⭐ must not be `dev-eml`/`no-op` (defaults `smtp`)                  | Mail transport                              |
| `ADMIN_EMAILS`                                                                      | ⭐ needed for your first admin (not a boot check)                   | Who can become admin                        |
| `VEREIN_IBAN` / `VEREIN_BIC` / `VEREIN_BANK`                                        | for SEPA/invoices (mismatched IBAN/BIC on a known bank boot-blocks) | Bank-bearing documents                      |
| `VEREIN_ADRESSE`                                                                    | recommended                                                         | Invoices, footers, Impressum                |
| `VEREIN_KONTAKT_EMAIL` / `PUBLIC_VEREIN_KONTAKT_EMAIL`                              | recommended                                                         | Legal pages, consent text                   |
| `VEREIN_VORSTAND`                                                                   | recommended                                                         | Legal pages, receipt signature              |
| `VEREIN_REGISTERGERICHT` / `VEREIN_VR`                                              | recommended                                                         | Impressum                                   |
| `VEREIN_AUFSICHTSBEHOERDE`                                                          | recommended                                                         | Datenschutzerklärung                        |
| `VEREIN_STEUERNUMMER`                                                               | recommended                                                         | Mail footers, receipts                      |
| `VEREIN_KONTAKT_PERSON` / `VEREIN_CONTACT_PHONE`                                    | recommended                                                         | Invoice footer                              |
| `VEREIN_FINANZAMT`                                                                  | for receipts                                                        | Donation receipts                           |
| `VEREIN_BEITRAG_DEFAULT_CENTS`                                                      | optional                                                            | Default membership fee                      |
| `VEREIN_BESCHEID_*` / `VEREIN_SATZUNG_FASSUNG` / `VEREIN_STEUERBEGUENSTIGTE_ZWECKE` | for receipts                                                        | Donation receipts                           |
| `CRON_SECRET`                                                                       | recommended (warns, doesn't block)                                  | Yearly reminder job auth                    |
| `PUBLIC_FORM_ENABLED`                                                               | optional (`false`)                                                  | Public Auslagen form                        |
| `FINANCE_SHEET_ID` / `LIVE_SHEET_ID`                                                | optional                                                            | `/healthz`, legacy import                   |

The authoritative schema — every variable, its type, its default — is
`src/lib/server/env.ts`. If this table and that file ever disagree, **the file is right.**

</details>

---

## 🆘 Troubleshooting

**The deploy boots but crashes immediately.**
Read the deploy log — `assertProductionEnvSafe()` throws a _named_ error
("`VEREIN_NAME` is required in production…"). Set the named var and redeploy. This guard
exists precisely so a misconfiguration fails loudly at startup instead of silently
serving broken pages.

**Boot fails with an "IBAN/BIC mismatch" error.**
Your `VEREIN_IBAN` and `VEREIN_BIC` name two _different_ banks. For a handful of
well-known German banks the app cross-checks the IBAN's bank code against the BIC and
refuses to boot on a mismatch — a deliberate typo-catcher. Fix whichever of the two is
wrong so they refer to the same bank, then redeploy.

**My magic-link email never arrives.**
Check, in order: (1) `MAIL_PROVIDER` is `smtp`/`resend`, not `dev-eml`; (2) `MAIL_FROM`
is an address at a domain you've verified with your provider; (3) your provider's
dashboard for a bounce. The login link is also printed to the server logs in a pinch.

**I edited a `VEREIN_*` var but `/impressum` still shows the old value.**
Expected — legal pages are prerendered. [Trigger a redeploy.](#the-one-exception-worth-tattooing-on-your-hand-)
Env edits without a rebuild don't touch the static legal HTML.

**The app shows a different name than I set in the env var.**
Someone saved the **Settings → Stammdaten** form, and the database value now wins over
the env var (by design). Edit it in the app, not in Vercel.

**Issuing a donation receipt says it's "not configured".**
`VEREIN_STEUERBEGUENSTIGTE_ZWECKE` (or another `VEREIN_BESCHEID_*` field) is empty. By
design the app refuses to print an incomplete tax document. Fill in [Step 11](#step-11--donation-receipts-zuwendungsbestätigung).

**A migration didn't apply.**
`gh run list --workflow=migrate.yml` → open the failed run. Most often
`NEON_MIGRATE_DATABASE_URL` isn't set as a GitHub secret. See
[`docs/RUNBOOK.md`](RUNBOOK.md) for recovery.

**Something deeper broke.**
`docs/RUNBOOK.md` covers secret rotation, backup restore, emergency stop, and the
migration runbook.

---

## You're live. Welcome. 🎈

You now run a real Vereinsverwaltung — your name, your bank, your legal pages, your
data, in your EU region. The same app that keeps one small Verein's books honest is now
keeping yours.

If you improve something every Verein would want, consider opening a pull request
upstream. The next treasurer who finds this repo at 11pm before a Mitgliederversammlung
will thank you. 💛
