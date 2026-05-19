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

  // File storage backend selection
  /** "drive" | "local-fs" — defaults to drive (prod). */
  STORAGE_BACKEND: z.enum(["drive", "local-fs"]).default("drive"),
  /** Filesystem root used when STORAGE_BACKEND=local-fs. */
  FILE_STORAGE_ROOT: z.string().default("./.dev-data/drive"),

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
  MAIL_PROVIDER: z.enum(["smtp", "resend", "dev-eml", "no-op"]).default("smtp"),
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
  /**
   * AVV/DPA release gate. PUBLIC_FORM_ENABLED is ONLY honoured when this is
   * also "true". Documented in docs/legal/auftragsverarbeitung/README.md;
   * Andy must flip this to true after Vercel + Neon DPAs are signed.
   */
  DPA_GATE_PASSED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  /** Canonical public origin (https://folgederwolke-app.vercel.app). Required in prod. */
  PUBLIC_BASE_URL: z.string().default(""),

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
  // Merge $env/dynamic/private with process.env. process.env wins so that
  // vi.stubEnv() in tests is reflected on re-import, AND any runtime
  // process.env update (e.g. CI-injected secrets) takes precedence over a
  // stale captured dynEnv. We still pull dynEnv as the base layer because
  // SvelteKit's loader has visibility into vars that aren't on process.env
  // in some build modes.
  const merged = { ...dynEnv, ...process.env } as Record<string, string>;
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

/**
 * Effective public-form gate. PUBLIC_FORM_ENABLED is documentation; the
 * actual runtime gate is the AND of PUBLIC_FORM_ENABLED and DPA_GATE_PASSED,
 * because routing data of non-members through subprocessors without signed
 * AVVs is a DSGVO Art. 28 violation. The ops + dsgvo reviews on 2026-05-19
 * flagged the original single-flag design as theatre.
 */
export function isPublicFormEnabled(): boolean {
  return env.PUBLIC_FORM_ENABLED && env.DPA_GATE_PASSED;
}

/**
 * Production startup checks. Called from hooks.server.ts. Throws if any
 * required env var would render the app insecure in production. In dev the
 * checks are advisory only.
 */
export function assertProductionEnvSafe(): void {
  const isProd = (process.env["NODE_ENV"] ?? "").toLowerCase() === "production";

  const session = env.SESSION_SECRET || process.env["SESSION_SECRET"] || "";
  if (session.length < 32) {
    const msg = `SESSION_SECRET is missing or shorter than 32 chars (len=${session.length}). Cookies would be signed with a weak/empty key.`;
    if (isProd) throw new Error(msg);
    console.warn(`[env] ${msg} — non-prod, continuing.`);
  }

  const baseUrl =
    env.PUBLIC_BASE_URL ||
    process.env["PUBLIC_BASE_URL"] ||
    process.env["ORIGIN"] ||
    "";
  if (isProd && !baseUrl) {
    throw new Error(
      "PUBLIC_BASE_URL (or ORIGIN) is required in production so magic-link URLs cannot be derived from an attacker-controlled Host header. See docs/reviews/2026-05-19-security-review.md CRIT-2.",
    );
  }

  if (isProd && env.PUBLIC_FORM_ENABLED && !env.DPA_GATE_PASSED) {
    console.warn(
      "[env] PUBLIC_FORM_ENABLED=true but DPA_GATE_PASSED=false — public form will remain disabled until both Vercel + Neon DPAs are signed.",
    );
  }
}
