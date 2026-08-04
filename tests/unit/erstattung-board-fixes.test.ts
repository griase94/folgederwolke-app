/**
 * The payout-path findings from board #172 (accounting-eur), pinned.
 *
 * All three majors were the same shape: the Werkstatt or the mail said one
 * thing and the server or the bank meant another. The tests therefore assert
 * across the seam — pool row vs. action, mail prop vs. Verwendungszweck —
 * rather than checking each side in isolation, because each side was
 * internally consistent while the pair was not.
 *
 * @vitest-environment node
 * @phase-2
 */

import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { expenses } from "$lib/server/db/schema/expenses.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { listApprovedPendingErstattet } from "$lib/server/domain/transactions.js";
import { markExpenseErstattet } from "$lib/server/domain/audit-inbox-actions.js";
import { zahlungsarten } from "$lib/server/db/schema/zahlungsarten.js";
import { registerHandlers } from "$lib/server/events/index.js";
import {
  erstattungsVerwendungszweck,
  sepaSafe,
} from "$lib/server/domain/erstattung-verwendungszweck.js";

const SNAPSHOT_IBAN = "DE89370400440532013000";

let seq = 0;
let katId = "";
let katName = "";
let katSphere: "ideeller" | "vermoegen" | "zweckbetrieb" | "wirtschaftlich" =
  "ideeller";
let zahlungsartId = "";

beforeAll(async () => {
  registerHandlers();
  const db = getDb();
  const [z] = await db
    .select({ id: zahlungsarten.id })
    .from(zahlungsarten)
    .limit(1);
  zahlungsartId = z!.id;
  const [k] = await db
    .select({
      id: kategorien.id,
      name: kategorien.name,
      sphere: kategorien.sphere,
    })
    .from(kategorien)
    .where(eq(kategorien.kind, "expense"))
    .limit(1);
  katId = k!.id;
  katName = k!.name;
  katSphere = k!.sphere;
});

/** An approved, unreimbursed member expense — a row of the Werkstatt pool. */
async function seedClaim(opts: {
  memberIban?: string | null;
  snapshotIban?: string | null;
  festgeschrieben?: boolean;
  abflussDatum?: string | null;
  /** Book the row into a year the settings lock — what the TRIGGER guards. */
  gebuchtAm?: string;
}) {
  const db = getDb();
  const n = 95000 + seq++;
  const [m] = await db
    .insert(members)
    .values({
      vorname: "Klara",
      nachname: `Zahlweg${n}`,
      email: `board-fix-${Date.now()}-${n}@portal.test`,
      eintrittsDatum: "2020-01-01",
      iban: opts.memberIban ?? null,
      isFixture: true,
    })
    .returning();
  const [exp] = await db
    .insert(expenses)
    .values({
      businessId: `A-2026-${n}`,
      bezeichnung: "Board-Fix-Auslage",
      betragCents: 2490n,
      rechnungsdatum: "2026-07-01",
      kategorieId: katId,
      kategorieNameSnapshot: katName,
      sphereSnapshot: katSphere,
      bezahltVonKind: "member",
      bezahltVonMemberId: m!.id,
      // The UI prefix that must never reach a bank form.
      bezahltVonDisplay: `Mitglied: Klara Zahlweg${n}`,
      belegVerzichtGrund: "Board-Fixture",
      approvedAt: new Date(),
      status: "geprueft",
      abflussDatum: opts.abflussDatum ?? null,
      festgeschriebenAt: opts.festgeschrieben ? new Date() : null,
      ...(opts.gebuchtAm ? { gebuchtAm: new Date(opts.gebuchtAm) } : {}),
    })
    .returning();
  if (opts.snapshotIban) {
    await db.insert(auslagenSubmissions).values({
      businessId: `AUS-2026-${n}`,
      bezeichnung: "Board-Fix-Auslage",
      betragCents: 2490n,
      rechnungsdatum: "2026-07-01",
      bezahltVonKind: "member",
      bezahltVonMemberId: m!.id,
      bezahltVonDisplay: `Mitglied: Klara Zahlweg${n}`,
      belegVerzichtGrund: "Board-Fixture",
      consentTextVersion: "test",
      erstattungIban: opts.snapshotIban,
      approvedExpenseId: exp!.id,
    });
  }
  return {
    expenseId: exp!.id,
    businessId: exp!.businessId,
    nachname: `Zahlweg${n}`,
  };
}

async function poolRow(expenseId: string) {
  const rows = await listApprovedPendingErstattet();
  return rows.find((r) => r.id === expenseId);
}

describe("@phase-2 MAJOR 3 — the bank gets a person's name, not a UI label", () => {
  it("resolves the member's own name for the Empfängername field", async () => {
    const { expenseId, nachname } = await seedClaim({
      memberIban: SNAPSHOT_IBAN,
    });
    const row = await poolRow(expenseId);
    expect(row?.empfaengerName).toBe(`Klara ${nachname}`);
    // The display string keeps its prefix — it is right on a list row.
    expect(row?.bezahltVonDisplay).toContain("Mitglied:");
    expect(row?.empfaengerName).not.toContain("Mitglied:");
  });
});

describe("@phase-2 MAJOR 1 — the pool never offers what the action refuses", () => {
  it("blocks a closed-year claim that has no Abfluss-Datum", async () => {
    const { expenseId } = await seedClaim({
      memberIban: SNAPSHOT_IBAN,
      festgeschrieben: true,
      abflussDatum: null,
    });
    const row = await poolRow(expenseId);
    // Still VISIBLE — the money is owed and hiding it was the original F4 bug.
    expect(row).toBeDefined();
    expect(row?.committable).toBe(false);
    expect(row?.blockReason).toBe("festgeschrieben-ohne-abfluss");
  });

  it("allows a closed-year claim that already has one (ADR-0006 carve-out)", async () => {
    const { expenseId } = await seedClaim({
      memberIban: SNAPSHOT_IBAN,
      festgeschrieben: true,
      abflussDatum: "2026-03-01",
    });
    const row = await poolRow(expenseId);
    expect(row?.festgeschrieben).toBe(true);
    expect(row?.committable).toBe(true);
    expect(row?.blockReason).toBeNull();
  });

  it("and the ACTION agrees: it answers 409 for exactly that row", async () => {
    // The pool's gate is a MIRROR of the action's guards. If they ever drift,
    // the Werkstatt is lying again — so the pin runs the real action on the
    // same row and demands the same verdict, with the year genuinely closed
    // (the rest of the suite only ever exercised open years, which is how the
    // original hole survived).
    // How this state arises in reality: the claim is booked while its year is
    // still open, and a later Jahresabschluss closes that year around it. A
    // Festschreibung can never be lifted (GoBD), so the test builds it the same
    // way instead of unlocking anything — seed into the next open year, then
    // move the lock forward over it.
    const db = getDb();
    const [lockRow] = await db.execute<{ value: unknown }>(
      sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
    );
    const lockedUntil = Number(
      String((lockRow as { value: unknown } | undefined)?.value ?? "0").replace(
        /"/g,
        "",
      ),
    );
    const openYear = lockedUntil + 1;

    const { expenseId } = await seedClaim({
      memberIban: SNAPSHOT_IBAN,
      abflussDatum: null,
      gebuchtAm: `${openYear}-06-01T10:00:00Z`,
    });
    await db.execute(
      sql`UPDATE settings SET value = ${String(openYear)}::jsonb WHERE key = 'festgeschrieben_bis'`,
    );

    const row = await poolRow(expenseId);
    // The pool must mirror the trigger WITHOUT relying on festgeschrieben_at:
    // this row was never individually stamped, only its year is closed.
    expect(row?.festgeschrieben).toBe(true);
    expect(row?.committable).toBe(false);
    expect(row?.blockReason).toBe("festgeschrieben-ohne-abfluss");

    const res = await markExpenseErstattet({
      expenseId,
      chosenDate: "2026-08-01",
      zahlungsartId,
      actorUserId: null as unknown as string,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);

    // The lock stays where it is: moving a Festschreibung backwards is exactly
    // what GoBD forbids, and the DB enforces it. The remaining tests in this
    // file book into the current year, well above the moved line.
  });

  it("blocks a claim without any payout target (§7)", async () => {
    const { expenseId } = await seedClaim({ memberIban: null });
    const row = await poolRow(expenseId);
    expect(row?.committable).toBe(false);
    expect(row?.blockReason).toBe("iban-fehlt");
  });

  it("prefers the submission snapshot over the profile IBAN (M4)", async () => {
    const { expenseId } = await seedClaim({
      memberIban: "AT611904300234573201",
      snapshotIban: SNAPSHOT_IBAN,
    });
    const row = await poolRow(expenseId);
    expect(row?.payoutIban).toBe(SNAPSHOT_IBAN);
    expect(row?.committable).toBe(true);
  });
});

describe("MINOR 2 — the 140-character cap is measured AFTER transliteration", () => {
  it("transliterates umlauts before capping, so the bank cannot truncate further", () => {
    const zweck = erstattungsVerwendungszweck(
      "AUS-2026-0001",
      "Turnverein Grünwald",
    );
    expect(zweck).toContain("Gruenwald");
    expect(zweck).not.toContain("ü");
    expect(zweck.length).toBeLessThanOrEqual(140);
    // Byte-identical to what a SEPA field would keep: running the transliteration
    // again changes nothing.
    expect(sepaSafe(zweck)).toBe(zweck);
  });

  it("keeps the whole reference inside 140 even when every character grows", () => {
    const zweck = erstattungsVerwendungszweck("AUS-2026-0001", "ü".repeat(120));
    expect(zweck.length).toBeLessThanOrEqual(140);
    expect(zweck).toContain("AUS-2026-0001");
  });

  it("never trims the AUS-Nr — it is the only matchable token", () => {
    const zweck = erstattungsVerwendungszweck("AUS-2026-0001", "X".repeat(400));
    expect(zweck).toContain("AUS-2026-0001");
    expect(zweck.length).toBe(140);
  });
});
