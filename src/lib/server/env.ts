import { env as dynEnv } from "$env/dynamic/private";
import { z } from "zod";

const schema = z.object({
  // Database
  DATABASE_URL: z.string().default(""),
  DIRECT_DATABASE_URL: z.string().default(""),

  // Auth
  SESSION_SECRET: z.string().default(""),

  // Google OAuth
  GOOGLE_OAUTH_CLIENT_ID: z.string().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().default(""),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().default(""),

  // Drive
  DRIVE_PARENT_FOLDER_ID: z.string().default(""),
  TEMPLATE_DOC_ID: z.string().default(""),

  // Sheets — legacy importer (Phase 6 one-shot cutover)
  /** Spreadsheet ID of the legacy PROD sheet (read via SA or fallback CSV upload). */
  LIVE_SHEET_ID: z.string().default(""),
  /** Absolute path to service-account JSON. When set + readable, importer uses SA-read path. */
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().default(""),

  // Admin
  ADMIN_EMAILS: z.string().default(""),

  // Mail
  MAIL_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
  MAIL_FROM: z.string().default(""),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z
    .string()
    .default("587")
    .transform((v) => parseInt(v, 10)),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),

  // Feature flags
  PUBLIC_FORM_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  // Cron auth
  /** Secret shared between Vercel cron scheduler and the app. */
  CRON_SECRET: z.string().default(""),

  // Org constants
  VEREIN_NAME: z.string().default(""),
  VEREIN_STEUERNUMMER: z.string().default(""),
  VEREIN_VR: z.string().default(""),
  VEREIN_ADRESSE: z.string().default(""),
  /** Verein IBAN for Beitragsreminder + SEPA templates. */
  VEREIN_IBAN: z.string().default(""),
  /** Verein BIC. */
  VEREIN_BIC: z.string().default(""),
  /** Verein Bankname (display). */
  VEREIN_BANK: z.string().default(""),

  // Spenden — Zuwendungsbestätigung (Bescheinigung) Pflichtfelder.
  // ZUWENDUNGSBESTAETIGUNG_ENABLED is derived 'auto' from BESCHEID_TYP +
  // VEREIN_FREISTELLUNGSBESCHEID_VZ (per masterplan §2.2 + §9). The presence
  // of a valid Bescheid is what gates Bescheinigungs-Generierung in the UI.
  /** "feststellung_60a" | "freistellungsbescheid" | "" (disabled). */
  VEREIN_BESCHEID_TYP: z.string().default(""),
  /** Date the Freistellungsbescheid / §60a-Feststellung was issued (YYYY-MM-DD). */
  VEREIN_BESCHEID_DATUM: z.string().default(""),
  /** Date of the Satzungsfassung (Pflichtfeld in §60a Wording). */
  VEREIN_SATZUNG_FASSUNG: z.string().default(""),
  /** Veranlagungszeitraum (YYYY) — only meaningful with TYP=freistellungsbescheid. */
  VEREIN_FREISTELLUNGSBESCHEID_VZ: z.string().default(""),
  /** "Steuerbegünstigte Zwecke" listed on the Bescheid (free text). */
  VEREIN_STEUERBEGUENSTIGTE_ZWECKE: z
    .string()
    .default(
      "Förderung der Kunst und Kultur sowie der Heimatpflege und Heimatkunde",
    ),

  // Deployment metadata
  COMMIT_SHA: z.string().default("dev"),
  DEPLOYED_AT: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

// Lazy, defensive load — never throws on import.
// Build-time SSR / prerender sees an empty env; that's OK.
// Runtime callers can `requireEnv("DATABASE_URL")` to fail loudly if missing.
function loadEnv(): Env {
  // Supplement $env/dynamic/private with process.env — handles the bundle
  // edge case where dynEnv is captured early and some keys aren't present yet.
  const merged = { ...process.env, ...dynEnv } as Record<string, string>;
  const result = schema.safeParse(merged);
  if (result.success) return result.data;
  return schema.parse({});
}

export const env = loadEnv();

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const v = env[key];
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing required env var: ${String(key)}`);
  }
  return v as NonNullable<Env[K]>;
}
