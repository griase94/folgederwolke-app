/**
 * Static legal text for the Datenschutz section of the public Auslagen form.
 * Ported from legacy config.ts FORM_DATENSCHUTZ_INFO.
 *
 * Lives in $lib/domain (NOT $lib/server/domain) so it can be imported by
 * both server-side code and client Svelte components without triggering
 * SvelteKit's server-module guard.
 *
 * Version stamp is stored alongside each submission so auditors can
 * reconstruct exactly which text the submitter agreed to.
 */

import { PUBLIC_VEREIN_KONTAKT_EMAIL } from "$env/static/public";

// Bumped from "2026-05-01-v1" when the consent contact email was parameterized
// (white-label PR3). Stored consents are immutable snapshots — the server
// validates each submission's version against this constant, so any older
// snapshot is rejected as stale rather than silently accepted.
export const DATENSCHUTZ_VERSION = "2026-06-05-v2";

export const DATENSCHUTZ_TITLE = "Datenschutz";

export const DATENSCHUTZ_TEXT =
  "Mit dem Absenden willigst du in die Verarbeitung deiner Angaben " +
  "(inkl. Beleg, Bankdaten falls externe Person) zur Auslagenerstattung " +
  "und gesetzlich vorgeschriebenen Buchhaltung ein.\n\n" +
  "Speicherdauer: 10 Jahre gemäß § 147 AO.\n" +
  "Rechtsgrundlage: Art. 6 Abs. 1 lit. b und c DSGVO.\n\n" +
  `Fragen oder Auskunftswunsch: ${PUBLIC_VEREIN_KONTAKT_EMAIL}`;

export const FORM_DESCRIPTION =
  "Hier reichst du Auslagen ein, die du für den Verein gezahlt hast. " +
  "Wir prüfen, importieren in unsere Buchhaltung und überweisen zurück. " +
  "Eingangsbestätigung kommt direkt; Erstattung in der Regel innerhalb der nächsten Tage.\n\n" +
  "Pro Auslage: ein Kauf, ein Beleg. Bei mehreren Käufen oder Belegen bitte " +
  "einzeln einreichen — sonst wird die Buchhaltung unsauber.";
