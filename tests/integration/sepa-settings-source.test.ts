/**
 * White-label Phase 1 — Task 1.5: SEPA initiator name AND debtor IBAN/BIC
 * both come from a single `readStammdaten()` read (one provenance contract),
 * NOT from `env.VEREIN_NAME || "Folge der Wolke e.V."` (initiator) plus a
 * separate `loadSepaDebtorFromSettings()` (debtor) that could diverge.
 *
 * With `verein.name` / `verein.iban` / `verein.bic` in settings, the
 * generated XML must surface all three; no FdW fallback when name is set.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import {
  generateSepaXmlFromSettings,
  type SepaTransactionInput,
} from "$lib/server/sepa/xml.js";

const tx: SepaTransactionInput = {
  id: "uuid-1",
  businessId: "AUS-2026-001",
  bezeichnung: "Druckerpatronen",
  betragCents: 2350,
  recipientIban: "DE89370400440532013000",
  recipientName: "Max Mustermann",
};

describe("Task 1.5 — SEPA initiator + debtor from one readStammdaten read", () => {
  beforeEach(async () => {
    await getDb().execute(
      sql`DELETE FROM settings WHERE key IN ('verein.name', 'verein.iban', 'verein.bic')`,
    );
  });

  afterEach(async () => {
    await getDb().execute(
      sql`DELETE FROM settings WHERE key IN ('verein.name', 'verein.iban', 'verein.bic')`,
    );
  });

  it("uses settings name as initiator and settings iban/bic as debtor — no FdW fallback", async () => {
    await getDb().execute(sql`
      INSERT INTO settings (key, value) VALUES
        ('verein.name', '"Verein X e.V."'::jsonb),
        ('verein.iban', '"DE02701500000000594937"'::jsonb),
        ('verein.bic', '"SSKMDEMMXXX"'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);

    const { xml } = await generateSepaXmlFromSettings([tx]);

    // Initiator + Dbtr name from settings (appears twice: InitgPty + Dbtr).
    expect(xml).toContain("<Nm>Verein X e.V.</Nm>");
    expect(xml).not.toContain("Folge der Wolke");
    // Debtor account from the SAME settings read.
    expect(xml).toContain("<IBAN>DE02701500000000594937</IBAN>");
    expect(xml).toContain("<BIC>SSKMDEMMXXX</BIC>");
    expect(xml).not.toContain("NOTPROVIDED");
  });
});
