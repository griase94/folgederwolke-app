/**
 * Single source of truth for the Beitrags-Reminder wording.
 *
 * Both the mail template (`BeitragsReminder.svelte`) AND the erinnerung-senden
 * sheet preview render from these functions, so the preview is byte-identical
 * to the sent mail (Flow C brief C2 / erinnerung-senden AC8 — "der Vorschau-Text
 * ist wörtlich der gerenderte Mail-Text"). Keeping the copy here makes drift a
 * test failure rather than a silent preview↔mail divergence.
 *
 * Client-safe — no server imports (mirrors `bescheinigung-wortlaut.ts`). The
 * bank-fact block (Empfänger/IBAN/Betrag/Verwendungszweck) stays server-rendered
 * and unverfälschbar; only the INTRO paragraph is editable in the Bulk sheet
 * (C2a), resolved through the same placeholder substitution here.
 *
 * SCOPE (Flow C): this module owns the copy contract + the {Frist}/customIntro
 * props delta. The full visual mail restyle and the N4 subject change belong to
 * Flow G (mail-beitrag-reminder) — when that lands, it updates the STANDARD
 * intro / subject here and both surfaces move together.
 */

/** de-DE currency, e.g. 69,69 €. ADR-0003: cents in, never a float amount. */
export function formatReminderEuro(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

/** ISO (YYYY-MM-DD) → DD.MM.YYYY; empty string on absent/malformed input. */
export function formatReminderFrist(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Verwendungszweck for the bank transfer — the treasurer matches incoming
 * payments on this exact string, so it is single-sourced (never re-derived).
 */
export function reminderVerwendungszweck(
  vorname: string,
  nachname: string,
  jahr: number,
): string {
  const name = nachname ? `${vorname} ${nachname}`.trim() : vorname;
  return `Mitgliedsbeitrag ${jahr} ${name}`.trim();
}

/**
 * Mail subject. Flow C keeps the current subject (Ruling 5); the Flow-G N4
 * restyle owns the subject change and must stay copy-equal with this preview.
 */
export function reminderSubject(jahr: number): string {
  return `Erinnerung: dein Mitgliedsbeitrag ${jahr} ist noch offen`;
}

/** Placeholder tokens the intro editor exposes (Bulk C2a). */
export const REMINDER_PLACEHOLDERS = [
  "{Name}",
  "{Jahr}",
  "{Betrag}",
  "{Frist}",
] as const;

export type ReminderPlaceholder = (typeof REMINDER_PLACEHOLDERS)[number];

/**
 * Standard editable intro (`data-copy="rem-intro"`). The {Frist} clause is only
 * appended when a Frist is present, so the sentence never dangles.
 */
export function standardReminderIntro(hasFrist: boolean): string {
  const base =
    "Liebste:r {Name}, kleine sonnige Erinnerung — dein Mitgliedsbeitrag für {Jahr} ist noch offen.";
  return hasFrist
    ? `${base} Zahlbar bis {Frist} — kein Stress, hier ist alles beisammen.`
    : base;
}

export type ReminderIntroVars = {
  vorname: string;
  jahr: number;
  betragCents: number;
  /** Fälligkeit — {Frist}. */
  fristAt?: string | null;
};

/**
 * Resolve {Name}/{Jahr}/{Betrag}/{Frist} in an intro template (standard OR the
 * Bulk-edited customIntro). Both surfaces call this, guaranteeing the preview
 * and the mail resolve placeholders identically.
 */
export function resolveReminderIntro(
  template: string,
  vars: ReminderIntroVars,
): string {
  return template
    .replaceAll("{Name}", vars.vorname)
    .replaceAll("{Jahr}", String(vars.jahr))
    .replaceAll("{Betrag}", formatReminderEuro(vars.betragCents))
    .replaceAll("{Frist}", formatReminderFrist(vars.fristAt));
}

/**
 * The fully-resolved intro paragraph. A non-empty `customIntro` overrides the
 * standard text; both are resolved through the same substitution so a custom
 * intro can use the same placeholders.
 */
export function reminderIntro(input: {
  vorname: string;
  jahr: number;
  betragCents: number;
  fristAt?: string | null;
  customIntro?: string | null;
}): string {
  const template =
    input.customIntro && input.customIntro.trim() !== ""
      ? input.customIntro
      : standardReminderIntro(!!input.fristAt);
  return resolveReminderIntro(template, input);
}

/** Zuordnungs-Warnung under the bank-fact block. */
export const REMINDER_ZUORDNUNG_WARN =
  "Bitte den Verwendungszweck genau so übernehmen — sonst können wir die Zahlung nicht zuordnen.";

/** Sinn-Absatz (why the Beitrag matters). Verein name interpolated. */
export function reminderSinnAbsatz(vereinName: string): string {
  return `Mit deinem Beitrag finanzieren wir unser ${vereinName} Wochenende, faire Künstler:innen-Honorare und alles, was unsere Wolke sonst noch so trägt.`;
}

/**
 * Solidar-Absatz — UNANTASTBAR (mail-beitrag-reminder §1.7 / AC3). The soul of
 * the mail: it is never edited and always present (also in Cron/Bulk). Kept as
 * a frozen constant so no editor path can drop or reword it.
 */
export const REMINDER_SOLIDAR_ABSATZ =
  "Falls Geld dieses Jahr knapp ist: meld dich bei uns — wir können den Beitrag aussetzen oder reduzieren. Niemand fliegt deshalb raus.";
