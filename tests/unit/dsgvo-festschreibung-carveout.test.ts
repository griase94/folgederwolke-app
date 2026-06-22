/**
 * @vitest-environment node
 * @phase-7
 *
 * F31 — DSGVO donor-PII erasure must succeed even when the donor has a
 * donation in a festgeschriebenes Jahr.
 *
 * The festschreibung trigger (assert_not_festgeschrieben_fn) fires only for
 * session_user = 'app_runtime'. Migration 0037 adds a carve-out: on
 * `donations`, an UPDATE that NULLs ONLY the three donor-PII columns
 * (spender_name/adresse/email) passes even on a locked-year row, while any
 * other UPDATE still raises 23514.
 *
 * Trigger-enforcement assertions use DATABASE_URL (app_runtime). Setup +
 * teardown use DIRECT_DATABASE_URL (superuser, trigger bypassed).
 *
 * Cross-year design (review F1/F-medium): the seed deliberately puts the CASH
 * date (zugewendet_am) in the LOCKED year while gebucht_am sits in an OPEN
 * year. The guarded Buchungsjahr must therefore be driven by the cash date
 * (the 0034 semantics this migration must preserve). If 0037 ever reverts to
 * year_for_booking(gebucht_am), the guard year would resolve to the OPEN year
 * and the rejection tests below would stop rejecting — catching the revert.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)(
  "F31 — donations festschreibung donor-PII carve-out",
  () => {
    let admin: ReturnType<typeof postgres>; // superuser — setup/teardown
    let app: ReturnType<typeof postgres>; // app_runtime — trigger fires
    const LOCKED_YEAR = 2095; // cash year (zugewendet_am) — festgeschrieben
    const OPEN_GEBUCHT_YEAR = 2099; // gebucht_am year — NOT festgeschrieben
    const BID = `S-${LOCKED_YEAR}-901`;
    const BID_X = `S-${LOCKED_YEAR}-902`; // cross-year INSERT probe
    let DON_KAT_ID = "";

    beforeAll(async () => {
      admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
      app = postgres(DATABASE_URL, { prepare: false, max: 1 });
      const [kd] = await admin<{ id: string }[]>`SELECT id FROM kategorien
        WHERE kind = 'income' AND name = 'Geldspende zweckfrei' LIMIT 1`;
      if (!kd) throw new Error("F31: missing 'Geldspende zweckfrei' kategorie");
      DON_KAT_ID = kd.id;
    });

    afterEach(async () => {
      await admin`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', 'null'::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb
      `;
      await admin`DELETE FROM donations WHERE business_id IN (${BID}, ${BID_X})`;
    });

    afterAll(async () => {
      await admin.end();
      await app.end();
    });

    async function seedLockedDonation() {
      // Insert as superuser (trigger bypassed) so the locked-year row exists.
      // CASH date in LOCKED_YEAR, gebucht_am in the OPEN year → year_of_buchung
      // (and the trigger's inline year) is driven by the cash date = locked.
      await admin`
        INSERT INTO donations (
          business_id, gebucht_am, zugewendet_am, betrag_cents,
          spender_name, spender_adresse, spender_email,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot,
          spende_kind, zweckbindung_kind
        ) VALUES (
          ${BID}, ${`${OPEN_GEBUCHT_YEAR}-02-01 10:00:00+01`}, ${`${LOCKED_YEAR}-06-15`},
          5000, 'Erika Spenderin', 'Spendergasse 1, 80331 München',
          'erika.spenderin@example.com',
          ${DON_KAT_ID}::uuid, 'Geldspende zweckfrei', 'ideeller',
          'geldspende', 'zweckfrei'
        )
      `;
      // Sanity-pin the cross-year setup so a future schema change can't silently
      // collapse both years to the same value and neuter the regression intent.
      const [chk] = await admin<{ yob: number }[]>`
        SELECT year_of_buchung AS yob FROM donations WHERE business_id = ${BID}
      `;
      expect(chk?.yob).toBe(LOCKED_YEAR);
      await admin`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(LOCKED_YEAR)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
    }

    it("allows an app_runtime PII-only redaction on a festgeschriebene Spende", async () => {
      await seedLockedDonation();

      // The exact UPDATE pseudonymise() issues — NULL the three PII columns.
      await expect(
        app`
          UPDATE donations
             SET spender_name = NULL,
                 spender_adresse = NULL,
                 spender_email = NULL,
                 updated_at = now()
           WHERE business_id = ${BID}
        `,
      ).resolves.toBeDefined();

      const [row] = await admin<
        { spender_name: string | null; betrag_cents: string }[]
      >`SELECT spender_name, betrag_cents FROM donations WHERE business_id = ${BID}`;
      expect(row?.spender_name).toBeNull();
      // §147 AO: the financial record is retained untouched.
      expect(row?.betrag_cents).toBe("5000");
    });

    it("still rejects a non-PII UPDATE on a festgeschriebene Spende (23514)", async () => {
      await seedLockedDonation();

      let err: unknown = null;
      try {
        await app`
          UPDATE donations SET betrag_cents = 9999 WHERE business_id = ${BID}
        `;
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("rejects a PII redaction that also mutates a financial column (23514)", async () => {
      await seedLockedDonation();

      let err: unknown = null;
      try {
        await app`
          UPDATE donations
             SET spender_name = NULL, betrag_cents = 1
           WHERE business_id = ${BID}
        `;
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("rejects a PII redaction that also mutates a NON-financial non-PII column (betriebsvermoegen) (23514)", async () => {
      // Review F2: the 9 previously-unguarded columns (here betriebsvermoegen)
      // must NOT be mutable alongside a PII redaction on a locked-year row.
      await seedLockedDonation();

      let err: unknown = null;
      try {
        await app`
          UPDATE donations
             SET spender_name = NULL,
                 spender_adresse = NULL,
                 spender_email = NULL,
                 betriebsvermoegen = true
           WHERE business_id = ${BID}
        `;
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("blocks an app_runtime INSERT whose CASH date is in a locked year (cash-date drives the guard — 0034 regression probe)", async () => {
      // festgeschrieben_bis = LOCKED_YEAR; the new row's gebucht_am is in the
      // OPEN year but its zugewendet_am cash date is in the locked year. The
      // 0034 cash-date semantics MUST block this; a gebucht_am-based revert
      // would let it through.
      await admin`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(LOCKED_YEAR)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;

      let err: unknown = null;
      try {
        await app`
          INSERT INTO donations (
            business_id, gebucht_am, zugewendet_am, betrag_cents,
            spender_name, kategorie_id, kategorie_name_snapshot, sphere_snapshot,
            spende_kind, zweckbindung_kind
          ) VALUES (
            ${BID_X}, ${`${OPEN_GEBUCHT_YEAR}-02-01 10:00:00+01`}, ${`${LOCKED_YEAR}-06-15`},
            5000, 'Probe', ${DON_KAT_ID}::uuid, 'Geldspende zweckfrei', 'ideeller',
            'geldspende', 'zweckfrei'
          )
        `;
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect((err as { code?: string }).code).toBe("23514");
    });

    it("allows an app_runtime INSERT whose cash date is in an OPEN year (control)", async () => {
      await admin`
        INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(LOCKED_YEAR)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
      // Cash date in the OPEN year → not guarded → INSERT succeeds.
      await expect(
        app`
          INSERT INTO donations (
            business_id, gebucht_am, zugewendet_am, betrag_cents,
            spender_name, kategorie_id, kategorie_name_snapshot, sphere_snapshot,
            spende_kind, zweckbindung_kind
          ) VALUES (
            ${BID_X}, ${`${OPEN_GEBUCHT_YEAR}-02-01 10:00:00+01`}, ${`${OPEN_GEBUCHT_YEAR}-06-15`},
            5000, 'Probe', ${DON_KAT_ID}::uuid, 'Geldspende zweckfrei', 'ideeller',
            'geldspende', 'zweckfrei'
          )
        `,
      ).resolves.toBeDefined();
    });
  },
);
