// @vitest-environment node
/**
 * S3b MANDATORY GATE — Vorschau ↔ Mail copy-equality (erinnerung-senden AC8 /
 * mail-beitrag-reminder AC6).
 *
 * The Bulk sheet's preview and the sent mail must be byte-identical for the
 * copy-critical pieces (the editable intro, the Verwendungszweck, the
 * UNANTASTBAR Solidar-Absatz, the subject). Both surfaces render from the SAME
 * single source (`beitrag-reminder-copy`), so this test pins:
 *   (A) Template ↔ copy-module: the rendered BeitragsReminder mail contains the
 *       copy-module output verbatim.
 *   (B) Sheet ↔ copy-module: SendReminderBulkSheet builds its preview from the
 *       copy module (structural).
 * (A) ∧ (B) ⇒ Vorschau ≡ Mail.
 *
 * @aurora-impl-c2
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { renderMailTemplate } from "$lib/server/mail/render.js";
import { subjectFor } from "$lib/server/mail/index.js";
import BeitragsReminder from "$lib/server/mail/templates/BeitragsReminder.svelte";
import {
  reminderIntro,
  reminderSubject,
  reminderVerwendungszweck,
  REMINDER_SOLIDAR_ABSATZ,
} from "$lib/domain/beitrag-reminder-copy.js";

// Canon fixture (mail-beitrag-reminder §5).
const VORNAME = "Jonas";
const NACHNAME = "Köhler";
const JAHR = 2026;
const BETRAG_CENTS = 6969;
const FRIST = "2026-03-31";

const props = {
  vorname: VORNAME,
  nachname: NACHNAME,
  jahr: JAHR,
  betragCents: BETRAG_CENTS,
  iban: "DE21701500000123456789",
  bic: "SSKMDEMMXXX",
  bank: "Stadtsparkasse München",
  empfaenger: "Folge der Wolke e.V.",
  fristAt: FRIST,
  customIntro: null,
  // White-label identity injected by sendMail (footer + wordmarks).
  vereinName: "Folge der Wolke e.V.",
  adresse: "Teststraße 1, 12345 Testort",
  vr: "VR 211227",
  steuernummer: "143/215/10028",
};

describe("(A) Template ↔ copy-module: mail renders the copy-module output verbatim", () => {
  const { text } = renderMailTemplate(
    BeitragsReminder as unknown as Parameters<typeof renderMailTemplate>[0],
    props,
  );
  // The plain-text render preserves the template's source line-wrapping as
  // whitespace; collapse runs of whitespace so a wrapped paragraph still matches
  // its single-line copy-module constant (the WORDS must be identical).
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const normText = norm(text);

  it("editable intro (rem-intro) is byte-identical to reminderIntro()", () => {
    const expectedIntro = reminderIntro({
      vorname: VORNAME,
      jahr: JAHR,
      betragCents: BETRAG_CENTS,
      fristAt: FRIST,
      customIntro: null,
    });
    expect(normText).toContain(norm(expectedIntro));
  });

  it("Verwendungszweck is byte-identical to reminderVerwendungszweck()", () => {
    expect(normText).toContain(
      norm(reminderVerwendungszweck(VORNAME, NACHNAME, JAHR)),
    );
  });

  it("Solidar-Absatz (UNANTASTBAR) is present verbatim", () => {
    expect(normText).toContain(norm(REMINDER_SOLIDAR_ABSATZ));
  });

  it("subject single-source matches the mail's subjectFor()", () => {
    expect(reminderSubject(JAHR)).toBe(
      subjectFor("beitrag_reminder", { jahr: JAHR }),
    );
  });
});

describe("(B) Sheet ↔ copy-module: the Bulk sheet preview builds from the single source", () => {
  const src = readFileSync(
    join(
      process.cwd(),
      "src/lib/components/admin/members/SendReminderBulkSheet.svelte",
    ),
    "utf-8",
  );

  it("imports the copy module (no second, driftable copy)", () => {
    expect(src).toMatch(
      /from ['"]\$lib\/domain\/beitrag-reminder-copy(\.js)?['"]/,
    );
  });

  it("resolves the preview intro + Verwendungszweck + subject from it", () => {
    expect(src).toMatch(/resolveReminderIntro\(/);
    expect(src).toMatch(/reminderVerwendungszweck\(/);
    expect(src).toMatch(/reminderSubject\(/);
    expect(src).toMatch(/REMINDER_SOLIDAR_ABSATZ/);
  });
});
