/**
 * White-label Phase 1 — Task 1.6 (DB-driven): the Zuwendungsbestätigung
 * Pflichtfelder source Verein name / address / Steuernummer / VR from
 * `readStammdaten()` (settings → env), NOT from `env.VEREIN_*` directly; and
 * cert extraction REFUSES when steuerbegünstigte Zwecke are empty.
 *
 * To enable the cert path we temporarily mutate the shared `env` object's
 * Bescheid fields (rather than vi.resetModules(), which would re-instantiate
 * the cached DB pool in `db/index.ts` and leak connections across the suite).
 * `env` is a plain mutable object captured at module load; we save + restore
 * the touched fields in afterEach so other tests see the original values.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql, eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { env } from "$lib/server/env.js";
import { extractBmfPflichtfelder } from "$lib/server/domain/spenden.js";
import { donations } from "$lib/server/db/schema/donations.js";

const CERT_FIELDS = [
  "VEREIN_BESCHEID_TYP",
  "VEREIN_BESCHEID_DATUM",
  "VEREIN_FREISTELLUNGSBESCHEID_VZ",
  "VEREIN_FINANZAMT",
  "VEREIN_STEUERBEGUENSTIGTE_ZWECKE",
] as const;

const saved: Record<string, unknown> = {};

function setCertEnv(overrides: Record<string, string>): void {
  const e = env as unknown as Record<string, unknown>;
  for (const f of CERT_FIELDS) saved[f] = e[f];
  Object.assign(e, {
    VEREIN_BESCHEID_TYP: "freistellungsbescheid",
    VEREIN_BESCHEID_DATUM: "2024-03-15",
    VEREIN_FREISTELLUNGSBESCHEID_VZ: "2024",
    VEREIN_FINANZAMT: "Finanzamt Musterstadt",
    ...overrides,
  });
}

function restoreCertEnv(): void {
  const e = env as unknown as Record<string, unknown>;
  for (const f of CERT_FIELDS) e[f] = saved[f];
}

async function seedBescheinigtDonation(): Promise<string> {
  const db = getDb();
  const kategorien = (await db.execute(
    sql`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`,
  )) as unknown as ReadonlyArray<{ id: string; name: string; sphere: string }>;
  const kat = kategorien[0]!;
  const rows = (await db.execute(sql`
    INSERT INTO donations (
      business_id, source, gebucht_am, zugewendet_am,
      betrag_cents, currency, spender_name, spender_adresse,
      spende_kind, zweckbindung_kind,
      kategorie_id, kategorie_name_snapshot, sphere_snapshot,
      bescheinigung_nr, bescheinigung_ausgestellt_am, bescheid_typ
    ) VALUES (
      'S-2099-901', 'app', '2099-04-05 10:00:00+01'::timestamptz, '2099-04-05',
      30000, 'EUR', 'Max Mustermann', 'Hauptstr. 1, 80331 Muenchen',
      'geldspende', 'zweckfrei',
      ${kat.id}::uuid, ${kat.name}, ${kat.sphere}::sphere,
      'B-2099-901', '2099-05-01', 'geldspende'
    ) RETURNING id
  `)) as unknown as ReadonlyArray<{ id: string }>;
  return rows[0]!.id;
}

describe("Task 1.6 — Bescheinigung Pflichtfelder from settings + Zwecke gate", () => {
  beforeEach(async () => {
    await getDb().execute(
      sql`DELETE FROM donations WHERE business_id = 'S-2099-901'`,
    );
    await getDb().execute(
      sql`DELETE FROM settings WHERE key IN ('verein.name', 'verein.adresse', 'verein.steuernummer', 'verein.vr')`,
    );
  });

  afterEach(async () => {
    restoreCertEnv();
    await getDb().execute(
      sql`DELETE FROM donations WHERE business_id = 'S-2099-901'`,
    );
    await getDb().execute(
      sql`DELETE FROM settings WHERE key IN ('verein.name', 'verein.adresse', 'verein.steuernummer', 'verein.vr')`,
    );
  });

  it("sources name/address/Steuernummer/VR from settings (verein.*), Finanzamt from env", async () => {
    setCertEnv({
      VEREIN_STEUERBEGUENSTIGTE_ZWECKE: "der Foerderung des Sports",
    });

    const db = getDb();
    await db.execute(sql`
      INSERT INTO settings (key, value) VALUES
        ('verein.name', '"Verein X e.V."'::jsonb),
        ('verein.adresse', '"Musterweg 1\\n12345 Musterstadt"'::jsonb),
        ('verein.steuernummer', '"99/999/99999"'::jsonb),
        ('verein.vr', '"VR 777777"'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);

    const donationId = await seedBescheinigtDonation();
    const row = (
      await db
        .select()
        .from(donations)
        .where(eq(donations.id, donationId))
        .limit(1)
    )[0]!;

    const pf = await extractBmfPflichtfelder(row);
    expect(pf.vereinName).toBe("Verein X e.V.");
    expect(pf.vereinAdresse).toBe("Musterweg 1\n12345 Musterstadt");
    expect(pf.vereinSteuernummer).toBe("99/999/99999");
    expect(pf.vereinVr).toBe("VR 777777");
    expect(pf.vereinFinanzamt).toBe("Finanzamt Musterstadt");
  });

  it("refuses extraction when steuerbegünstigte Zwecke are empty", async () => {
    setCertEnv({ VEREIN_STEUERBEGUENSTIGTE_ZWECKE: "" });

    const db = getDb();
    const donationId = await seedBescheinigtDonation();
    const row = (
      await db
        .select()
        .from(donations)
        .where(eq(donations.id, donationId))
        .limit(1)
    )[0]!;

    await expect(extractBmfPflichtfelder(row)).rejects.toThrow();
  });
});
