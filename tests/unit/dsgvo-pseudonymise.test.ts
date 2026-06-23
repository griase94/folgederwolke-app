/**
 * @vitest-environment node
 * @phase-7
 *
 * F31 — end-to-end pseudonymise() against a festgeschriebene Spende.
 *
 * (1) Fast path: with the 0037 carve-out applied, pseudonymise() redacts BOTH a
 *     locked-year and an open-year donation sharing the donor email, the member
 *     PII is redacted, and the whole transaction COMMITS (donationsSkipped=0).
 * (2) Slow path: the per-row savepoint fallback. We temporarily swap the
 *     trigger function for a body WITHOUT the donations carve-out (the pre-0037
 *     behaviour), so the locked-year donation's redaction is rejected. The
 *     erasure must then SKIP that one row (donationsSkipped=1) and still commit
 *     the rest — never abort the whole transaction.
 *
 * pseudonymise() runs through getDb() (app_runtime → trigger fires). Setup +
 * assertions + the function swap use DIRECT_DATABASE_URL (superuser).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import postgres from "postgres";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "";
const DIRECT_DATABASE_URL = process.env["DIRECT_DATABASE_URL"] ?? "";
const dbConfigured = DATABASE_URL.length > 0 && DIRECT_DATABASE_URL.length > 0;

describe.skipIf(!dbConfigured)("F31 — pseudonymise() e2e", () => {
  let admin: ReturnType<typeof postgres>;
  const LOCKED_YEAR = 2094;
  const OPEN_YEAR = 2099;
  const EMAIL = "loeschung@example.com";
  const BID_LOCKED = `S-${LOCKED_YEAR}-911`;
  const BID_OPEN = `S-${OPEN_YEAR}-911`;
  let DON_KAT_ID = "";
  let memberId = "";
  let userId = "";
  let origFnDef = "";

  beforeAll(async () => {
    admin = postgres(DIRECT_DATABASE_URL, { prepare: false, max: 1 });
    const [kd] = await admin<{ id: string }[]>`SELECT id FROM kategorien
      WHERE kind = 'income' AND name = 'Geldspende zweckfrei' LIMIT 1`;
    if (!kd) throw new Error("pseudonymise: missing kategorie");
    DON_KAT_ID = kd.id;
    // Capture the live function definition so the slow-path test can restore it.
    const [def] = await admin<{ d: string }[]>`
      SELECT pg_get_functiondef('public.assert_not_festgeschrieben_fn()'::regprocedure) AS d
    `;
    origFnDef = def!.d;
  });

  afterEach(async () => {
    // Restore the real function + clear lock + remove test rows.
    if (origFnDef) await admin.unsafe(origFnDef);
    await admin`
      INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', 'null'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = 'null'::jsonb
    `;
    await admin`DELETE FROM donations WHERE business_id IN (${BID_LOCKED}, ${BID_OPEN})`;
    if (memberId) await admin`DELETE FROM members WHERE id = ${memberId}`;
    if (userId) await admin`DELETE FROM users WHERE id = ${userId}`;
    memberId = "";
    userId = "";
  });

  afterAll(async () => {
    await admin.end();
  });

  async function seed() {
    const [m] = await admin<{ id: string }[]>`
      INSERT INTO members (vorname, nachname, email, email_canonical)
      VALUES ('Lösch', 'Kandidat', ${EMAIL}, ${EMAIL}) RETURNING id
    `;
    memberId = m!.id;
    const [u] = await admin<{ id: string }[]>`
      INSERT INTO users (email, email_canonical, role)
      VALUES (${EMAIL}, ${EMAIL}, 'admin') RETURNING id
    `;
    userId = u!.id;
    for (const [bid, cashYear] of [
      [BID_LOCKED, LOCKED_YEAR],
      [BID_OPEN, OPEN_YEAR],
    ] as const) {
      await admin`
        INSERT INTO donations (
          business_id, gebucht_am, zugewendet_am, betrag_cents,
          spender_name, spender_adresse, spender_email,
          kategorie_id, kategorie_name_snapshot, sphere_snapshot,
          spende_kind, zweckbindung_kind
        ) VALUES (
          ${bid}, ${`${cashYear}-06-15 10:00:00+02`}, ${`${cashYear}-06-15`},
          5000, 'Lösch Kandidat', 'Weg 1', ${EMAIL},
          ${DON_KAT_ID}::uuid, 'Geldspende zweckfrei', 'ideeller',
          'geldspende', 'zweckfrei'
        )
      `;
    }
    await admin`
      INSERT INTO settings (key, value) VALUES ('festgeschrieben_bis', ${admin.json(LOCKED_YEAR)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }

  async function donationName(bid: string): Promise<string | null> {
    const [r] = await admin<{ spender_name: string | null }[]>`
      SELECT spender_name FROM donations WHERE business_id = ${bid}
    `;
    return r?.spender_name ?? null;
  }

  it("fast path: redacts locked + open donations and commits the whole erasure", async () => {
    await seed();
    const { pseudonymise } = await import("$lib/server/domain/dsgvo.js");

    const res = await pseudonymise(EMAIL, null);

    expect(res.donationsRedacted).toBe(2);
    expect(res.donationsSkipped).toBe(0);
    expect(res.membersPseudonymised).toBe(1);
    expect(res.usersDeleted).toBe(1);

    // PII gone from BOTH donations; financial record retained.
    expect(await donationName(BID_LOCKED)).toBeNull();
    expect(await donationName(BID_OPEN)).toBeNull();
    const [row] = await admin<{ betrag_cents: string }[]>`
      SELECT betrag_cents FROM donations WHERE business_id = ${BID_LOCKED}
    `;
    expect(row?.betrag_cents).toBe("5000");
    // Member PII redacted (proves the member step committed, not rolled back).
    const [mrow] = await admin<{ vorname: string }[]>`
      SELECT vorname FROM members WHERE id = ${memberId}
    `;
    expect(mrow?.vorname).toBe("****");
  });

  it("slow path: a row the trigger rejects is SKIPPED, the rest still erased", async () => {
    await seed();

    // Swap in a body WITHOUT the donations PII carve-out (pre-0037): any UPDATE
    // on the locked donation now raises 23514, forcing the savepoint fallback.
    await admin.unsafe(`
      CREATE OR REPLACE FUNCTION public.assert_not_festgeschrieben_fn() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
      DECLARE v_frozen_until integer; v_row_year integer;
      BEGIN
        IF session_user <> 'app_runtime' THEN RETURN COALESCE(NEW, OLD); END IF;
        SELECT public._festgeschrieben_extract_year(value) INTO v_frozen_until
          FROM public.settings WHERE key = 'festgeschrieben_bis';
        IF v_frozen_until IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
        IF TG_OP = 'DELETE' THEN
          v_row_year := COALESCE(extract(year FROM OLD.zugewendet_am)::int, public.year_for_booking(OLD.gebucht_am));
        ELSE
          v_row_year := COALESCE(extract(year FROM NEW.zugewendet_am)::int, public.year_for_booking(NEW.gebucht_am));
        END IF;
        IF v_row_year IS NOT NULL AND v_row_year <= v_frozen_until THEN
          RAISE EXCEPTION 'locked' USING ERRCODE = 'check_violation';
        END IF;
        RETURN COALESCE(NEW, OLD);
      END $$;
    `);

    const { pseudonymise } = await import("$lib/server/domain/dsgvo.js");
    const res = await pseudonymise(EMAIL, null);

    // The open donation is redacted; the locked one is skipped (not aborted).
    expect(res.donationsRedacted).toBe(1);
    expect(res.donationsSkipped).toBe(1);
    // The rest of the erasure still committed.
    expect(res.membersPseudonymised).toBe(1);
    expect(res.usersDeleted).toBe(1);
    expect(await donationName(BID_OPEN)).toBeNull();
    expect(await donationName(BID_LOCKED)).toBe("Lösch Kandidat"); // skipped
    const [mrow] = await admin<{ vorname: string }[]>`
      SELECT vorname FROM members WHERE id = ${memberId}
    `;
    expect(mrow?.vorname).toBe("****");
  });
});
