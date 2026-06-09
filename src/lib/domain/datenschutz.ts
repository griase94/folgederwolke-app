/**
 * Legal text for the Datenschutz section of the public Auslagen form.
 * Ported from legacy config.ts FORM_DATENSCHUTZ_INFO.
 *
 * Lives in $lib/domain (NOT $lib/server/domain) so it can be imported by
 * both server-side code and client Svelte components without triggering
 * SvelteKit's server-module guard.
 *
 * White-label: the contact email is INJECTED by the caller via
 * `datenschutzText(kontaktEmail)` — the root layout exposes it as
 * `kontaktEmail` (server-side `env.VEREIN_KONTAKT_EMAIL`). This keeps the
 * client-importable module free of `$env` (which can't resolve in BOTH the
 * production build — `$env/static/public` MISSING_EXPORT when unset — AND the
 * browser-conditions vitest run — `$env/dynamic/public` is undefined), matching
 * the repo's "server reads env, passes to client" convention.
 *
 * Version stamp is stored alongside each submission so auditors can
 * reconstruct exactly which text the submitter agreed to.
 */

// Bumped from "2026-05-01-v1" when the consent contact email was parameterized
// (white-label). Stored consents are immutable snapshots — the server validates
// each submission's version against this constant, so any older snapshot is
// rejected as stale rather than silently accepted.
export const DATENSCHUTZ_VERSION = "2026-06-05-v2";

export const DATENSCHUTZ_TITLE = "Datenschutz";

/**
 * Consent text shown on the public form. `kontaktEmail` is the runtime Verein
 * contact address (server-provided via the root layout's `kontaktEmail`).
 */
export function datenschutzText(kontaktEmail: string): string {
  return (
    "Mit dem Absenden willigst du in die Verarbeitung deiner Angaben " +
    "(inkl. Beleg, Bankdaten falls externe Person) zur Auslagenerstattung " +
    "und gesetzlich vorgeschriebenen Buchhaltung ein.\n\n" +
    "Speicherdauer: 10 Jahre gemäß § 147 AO.\n" +
    "Rechtsgrundlage: Art. 6 Abs. 1 lit. b und c DSGVO.\n\n" +
    `Fragen oder Auskunftswunsch: ${kontaktEmail}`
  );
}

export const FORM_DESCRIPTION =
  "Hier reichst du Auslagen ein, die du für den Verein gezahlt hast. " +
  "Wir prüfen, importieren in unsere Buchhaltung und überweisen zurück. " +
  "Eingangsbestätigung kommt direkt; Erstattung in der Regel innerhalb der nächsten Tage.\n\n" +
  "Pro Auslage: ein Kauf, ein Beleg. Bei mehreren Käufen oder Belegen bitte " +
  "einzeln einreichen — sonst wird die Buchhaltung unsauber.";
