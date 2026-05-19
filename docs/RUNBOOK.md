# RUNBOOK — folgederwolke-app

Operational procedures for Kassenwart, Vorstand, and Technical Operator.
Last updated: Phase 7.5 (2026-05).

---

## 1. Rotate Secrets

Use when: credential exposure suspected, periodic rotation (annual), staff change.

### 1.1 SESSION_SECRET

Zero-downtime rotation via Vercel env swap:

```bash
# Generate new secret
NEW_SECRET=$(openssl rand -base64 64)

# Add to Vercel (all environments)
vercel env add SESSION_SECRET production   # paste NEW_SECRET when prompted
vercel env add SESSION_SECRET preview
vercel env add SESSION_SECRET development

# Trigger redeployment (picks up new secret)
vercel redeploy --prod

# Effect: all existing sessions are invalidated immediately after deploy.
# Admins must re-authenticate via magic link.
# No data loss. Downtime: 0 (Vercel instant swap).
```

Update 1Password entry `folgederwolke-app / SESSION_SECRET` with new value.

### 1.2 GOOGLE_OAUTH_REFRESH_TOKEN

```bash
# Re-run the OAuth consent flow
cd /path/to/folgederwolke-app
pnpm tsx scripts/reauth-drive.ts
# Follow the printed URL, complete OAuth consent as andy.griesbeck@gmail.com
# New refresh token is printed — copy it

vercel env add GOOGLE_OAUTH_REFRESH_TOKEN production  # paste new token
vercel redeploy --prod
```

Update 1Password entry `folgederwolke-app / GOOGLE_OAUTH_REFRESH_TOKEN`.

### 1.3 DATABASE_URL (Neon connection string)

```bash
# 1. In Neon Console: reset role password for app_runtime
#    Dashboard → Project → Roles → app_runtime → Reset password

# 2. Update connection string in Vercel
vercel env add DATABASE_URL production  # paste new connection string with new password
vercel env add DATABASE_URL preview

# 3. Redeploy
vercel redeploy --prod

# 4. Verify healthcheck
curl https://folgederwolke-app.vercel.app/healthz
# Expected: {"status":"ok","db":"connected"}
```

Also update `DATABASE_URL_BACKUP` secret in GitHub repo settings
(used by the nightly backup workflow).

### 1.4 RESEND_API_KEY (when MAIL_PROVIDER=resend)

```bash
# 1. Generate new key in Resend dashboard
# 2. Add to Vercel
vercel env add RESEND_API_KEY production
vercel redeploy --prod
# 3. Revoke old key in Resend dashboard
```

<!-- §1.5 (BACKUP_AGE_RECIPIENT rotation) intentionally removed —
  age-key encryption is deferred (issue #30). When we re-enable encryption,
  restore the rotation procedure with a link from there. -->

---

## 2. Restore from Backup

### 2.1 Identify the backup to restore

**Option A — Neon Point-in-Time Restore (fastest, ≤ 7 days back)**

```
Neon Console → Project → Branches → main → Restore
Select timestamp → Create restore branch
# This creates a new branch; swap DATABASE_URL to point at it
```

**Option B — pg_dump restore from Drive backup (Issue #31)**

Once the nightly backup workflow is configured (see Issue #31 — needs
`DATABASE_URL_BACKUP` and `DRIVE_BACKUP_FOLDER_ID` secrets), restore looks like:

```bash
# 1. From Drive, download the .dump file you want
#    (e.g. `fdw-2026-04-15.dump`).

# 2. Create a new Neon branch for restore — never restore to production directly.
#    Neon Console → Branches → New Branch → "restore-YYYY-MM-DD"
#    Copy the new branch's DIRECT DATABASE_URL into RESTORE_URL.

# 3. Restore
pg_restore --no-owner --no-acl --exit-on-error \
  -d "${RESTORE_URL}" \
  fdw-2026-04-15.dump

# 4. Quick verification
psql "${RESTORE_URL}" -c "SELECT COUNT(*) FROM expenses;"
psql "${RESTORE_URL}" -c "SELECT MAX(chain_seq) FROM audit_log;"

# 5. Swap production to the restored branch (only when verified):
#    Vercel env → update DATABASE_URL to restored branch URL → Redeploy.
curl https://folgederwolke-app.vercel.app/healthz
```

<!-- Encrypted-backup-restore + dual-witness restore deferred (issue #30 / #31).
  Pre-pragmatic-rebalance RUNBOOK had multi-step decrypt + GitHub backup repo
  + Drive variants here; removed because they pointed at infrastructure that
  does not exist yet at this Verein's scale. -->

### 2.2 Post-restore checklist

- [ ] Healthcheck returns 200 with a non-null `db` field
- [ ] Admin login works via magic link
- [ ] Spot-check: most recent 5 expenses visible in `/app/transactions`
- [ ] Audit chain integrity verified (§4)
- [ ] If data loss detected: notify Vorstand

---

## 3. Emergency Stop

### 3.1 Disable public form immediately

```bash
# Option A: Vercel CLI (fastest)
vercel env add PUBLIC_FORM_ENABLED false production
vercel redeploy --prod
# Effect: /form returns 404; no new submissions accepted.
# Existing data unaffected.

# Option B: Vercel Dashboard
# Settings → Environment Variables → PUBLIC_FORM_ENABLED → Edit → false → Save
# Then: Deployments → Redeploy latest production deployment
```

### 3.2 Full production emergency stop (app down)

```bash
# Instant rollback to last known-good deployment
vercel rollback  # interactive: select previous deployment
# OR target a specific deployment URL:
vercel rollback https://folgederwolke-app-<hash>.vercel.app

# Verify
curl https://folgederwolke-app.vercel.app/healthz
```

### 3.3 Drain Neon connection pool

If the database is under unexpected load or a connection leak is suspected:

```
Neon Console → Project → Branches → main → Connections
→ "Suspend compute" (pauses Neon serverless; all connections dropped)
→ Resume when ready
```

Or via Neon API:

```bash
curl -X POST "https://console.neon.tech/api/v2/projects/${NEON_PROJECT_ID}/endpoints/${ENDPOINT_ID}/suspend" \
  -H "Authorization: Bearer ${NEON_API_KEY}"
```

### 3.4 Autonomous build abort sentinel

```bash
touch ~/.folgederwolke-build/state/ABORT
# Subagents + conductor poll this file; they stop after current step.
```

### 3.5 Cleanup after emergency

```bash
# Roll back to last known-good phase tag
scripts/orchestration/cleanup.sh [phase-number]
```

---

## 4. Investigate Audit Chain Break

Use when: hash mismatch alert, GoBD audit by Finanzamt, tamper suspicion.

### 4.1 Detect tampered rows

Use the TS verifier — it shares the exact recipe with the SQL trigger
(`src/lib/server/audit-log/chain.ts` + `verifier.ts`). Inline SQL
verification is brittle (the recipe spans 13 columns including ms-precision
timestamps; a hand-typed SQL query that drifts will false-flag every row).

```bash
# Run the nightly verifier ad-hoc:
DIRECT_DATABASE_URL=$(...your direct Neon URL...) \
pnpm tsx -e 'import { verifyAuditChain } from "$lib/server/audit-log/verifier.js"; verifyAuditChain().then(r => console.log(JSON.stringify(r, null, 2)));'

# A clean chain returns { ok: true, breaks: [], head: <N>, persistedHead: <N> }.
# Any non-empty breaks array names the offending row id + chain_seq.
```

Quick row-count sanity check (no recipe involved):

```sql
SELECT
  COUNT(*)              AS rows_total,
  COUNT(chain_seq)      AS rows_chained,
  MAX(chain_seq)        AS max_seq,
  (SELECT (value->>'chain_seq')::int FROM settings WHERE key='audit_chain_last_head') AS persisted_head
FROM audit_log;
-- max_seq < persisted_head → suffix truncation (the verifier catches this).
```

### 4.2 Identify break point

```sql
-- Find first chain_seq where prev_hash does not match the previous row's row_hash
SELECT
  a.chain_seq AS break_at,
  a.id AS suspect_row_id,
  a.prev_hash AS claimed_prev_hash,
  b.row_hash AS actual_prev_hash
FROM audit_log a
LEFT JOIN audit_log b ON b.chain_seq = a.chain_seq - 1
WHERE a.chain_seq > 1
  AND a.prev_hash IS DISTINCT FROM b.row_hash
ORDER BY a.chain_seq
LIMIT 5;
```

### 4.3 Re-seal procedure

**Important**: Do NOT modify existing `row_hash` or `prev_hash` values — this destroys
the evidence. Instead:

1. Export the full `audit_log` to CSV (evidence preservation):
   ```bash
   psql "${DATABASE_URL}" -c "\COPY audit_log TO '/tmp/audit_log_evidence.csv' CSV HEADER"
   ```
2. Document the break point and all suspect rows
3. Consult Kassenwart and Vorstand
4. If tampering confirmed: notify BayLDA within 72h (Art. 33 DSGVO)
5. Re-seal: insert a special audit_log row with `action='festschreibung'` and
   `payload={"event":"chain_investigation","break_at": N, "investigated_by": "...","note": "..."}` —
   this creates a new valid chain tip going forward

### 4.4 GoBD legal notification requirements

Under GoBD Tz. 64–68 and § 146a AO, if tampered bookings are discovered:

- Finanzamt must be notified voluntarily (Selbstanzeige) before a tax audit begins
- A corrected EÜR for the affected year(s) must be submitted
- All original tampered rows must be preserved (never deleted — they are evidence)
- Engage a tax advisor (Steuerberater) immediately

---

## 5. Common Operational Tasks

### 5.1 Trigger manual backup

```bash
# GitHub Actions → db-backup workflow → Run workflow (manual trigger)
# Or via CLI:
gh workflow run db-backup.yml --repo griase94/folgederwolke-app
```

### 5.2 Check backup health

```bash
# View last 5 backup workflow runs
gh run list --workflow=db-backup.yml --repo griase94/folgederwolke-app --limit 5
```

<!-- §5.3 restore-smoke-test removed — the existing scripts/restore-smoke.sh
  exercises a 4-column fixture, not the real schema (ops review CRIT-1).
  A real annual restore drill against a Neon scratch branch (RUNBOOK §2.1 B)
  is the correct test; quarterly cadence is theatre at this scale. -->

### 5.3 Check audit chain length

```sql
SELECT MAX(chain_seq) AS chain_length, COUNT(*) AS total_rows FROM audit_log;
```

### 5.5 Year-end Festschreibung

1. Export EÜR: `/app/eur/export?year=YYYY` → save CSV
2. Review all expenses and income for the year
3. Navigate to `/app/einstellungen/festschreibung`
4. Confirm Festschreibung for year YYYY
5. System sets `festgeschrieben_at` on all rows for that year
6. Export audit log for the year as evidence
7. Archive EÜR-CSV in Google Drive: `Vereinsverwaltung/Jahresabschlüsse/YYYY/`
