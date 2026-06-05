import { env as dynEnv } from "$env/dynamic/private";
import { z } from "zod";

// ---------------------------------------------------------------------------
// DE BLZ → BIC consistency check (cycle-2 expert review F2)
// ---------------------------------------------------------------------------
//
// German IBANs encode the Bankleitzahl (BLZ) in positions 4..11 (0-indexed) of
// the compact IBAN form. Every BLZ maps to a single bank, and that bank has a
// stable BIC prefix (the first 8 chars — the 11-char form is the BIC + branch
// code).
//
// This table is intentionally a small whitelist of BLZs we explicitly know,
// not a Bundesbank-mirror. Adding rows is cheap (one entry per Verein
// bank-account migration we'll ever do) and the check is conservative: for
// BLZs not in the table, the assertion is a no-op. The goal is to catch the
// SPECIFIC class of bug from PR #44 cycle-1 — where VEREIN_IBAN encodes
// Deutsche Skatbank (BLZ 83065408) but VEREIN_BIC is for a completely
// unrelated bank — without overengineering a full BLZ registry.
//
// Sources: Bundesbank Bankleitzahlendatei (public),
// https://www.bundesbank.de/de/aufgaben/unbarer-zahlungsverkehr/serviceangebot/bankleitzahlen
const KNOWN_DE_BLZ_TO_BIC8: Readonly<Record<string, string>> = Object.freeze({
  "83065408": "GENODEF1", // Deutsche Skatbank, Altenburg
  "10050000": "BELADEBE", // Berliner Sparkasse / Landesbank Berlin
  "10090000": "BEVODEBB", // Berliner Volksbank
  "70150000": "SSKMDEMM", // Stadtsparkasse München
});

/**
 * Extracts the 8-digit BLZ from a German IBAN (positions 4..11 of the
 * compact form). Returns null for non-DE IBANs or malformed input.
 */
export function extractDeBlz(iban: string): string | null {
  const compact = iban.replace(/\s+/g, "").toUpperCase();
  if (!compact.startsWith("DE")) return null;
  if (compact.length !== 22) return null;
  const blz = compact.slice(4, 12);
  if (!/^\d{8}$/.test(blz)) return null;
  return blz;
}

/**
 * Refuses to boot when VEREIN_IBAN encodes a German BLZ that contradicts
 * VEREIN_BIC. Tolerant of empty values (build-time / dev) and of BLZs we
 * don't have a mapping for. Exported for tests.
 *
 * Throws Error when (and only when) both values are present, the IBAN is a
 * DE IBAN, the BLZ is in our whitelist, and the BIC's first 8 chars don't
 * match the BLZ's expected BIC prefix.
 */
export function assertVereinBankConsistent(opts: {
  iban: string;
  bic: string;
}): void {
  const iban = (opts.iban ?? "").trim();
  const bic = (opts.bic ?? "").trim().toUpperCase();
  if (!iban || !bic) return; // dev / build-time tolerant

  const blz = extractDeBlz(iban);
  if (!blz) return; // non-DE or malformed IBAN — IBAN validation belongs elsewhere

  const expectedBicPrefix = KNOWN_DE_BLZ_TO_BIC8[blz];
  if (!expectedBicPrefix) return; // BLZ not in our table — advisory only

  // BIC is 8 or 11 chars; the 8-char prefix is the bank+country+location.
  const actualBicPrefix = bic.slice(0, 8);
  if (actualBicPrefix !== expectedBicPrefix) {
    throw new Error(
      `VEREIN_IBAN/VEREIN_BIC mismatch: IBAN BLZ ${blz} maps to BIC prefix ` +
        `'${expectedBicPrefix}' (Bundesbank Bankleitzahlendatei), but ` +
        `VEREIN_BIC='${bic}' has prefix '${actualBicPrefix}'. ` +
        `These are different banks — refusing to boot. ` +
        `Fix either VEREIN_IBAN or VEREIN_BIC so they refer to the same bank.`,
    );
  }
}

const schema = z.object({
  // Database
  DATABASE_URL: z.string().default(""),
  DIRECT_DATABASE_URL: z.string().default(""),

  // Auth
  SESSION_SECRET: z.string().default(""),

  // File storage backend selection (Phase 9 — Vercel Blob is the prod backend)
  /** "blob" | "local-fs" — defaults to blob (prod). */
  STORAGE_BACKEND: z.enum(["blob", "local-fs"]).default("blob"),
  /** Vercel Blob read-write token. Required in production when STORAGE_BACKEND=blob. */
  BLOB_READ_WRITE_TOKEN: z.string().default(""),
  /** Filesystem root used when STORAGE_BACKEND=local-fs. */
  FILE_STORAGE_ROOT: z.string().default("./.dev-data/files-test"),
  /** Filesystem root used when MAIL_PROVIDER=dev-eml. */
  MAIL_EML_ROOT: z.string().default("./.dev-data/mail"),

  // Drive / Sheets — service account auth (Phase 9 cutover from OAuth-as-Andy)
  /**
   * Full JSON contents of the Google service-account key file. Parsed at
   * load time into `env.googleServiceAccount`; the raw string is kept
   * non-enumerable on the exported env object so `JSON.stringify(env)`
   * (logs, error dumps) cannot leak the private key.
   */
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: z.string().default(""),

  // (Phase 10 removed DRIVE_PARENT_FOLDER_ID + TEMPLATE_DOC_ID — the
  // Rechnung renderer is now in-process pdf-lib and never reads from
  // Drive. The /healthz probe no longer pings Drive either.)

  // Sheets — legacy importer (Phase 6 one-shot cutover)
  /** Spreadsheet ID of the legacy PROD sheet (read via SA or fallback CSV upload). */
  LIVE_SHEET_ID: z.string().default(""),
  /** Spreadsheet ID of the ongoing finance sheet (Phase 9+). */
  FINANCE_SHEET_ID: z.string().default(""),

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
  // Default `false`: if the env var is missing or misspelled in production,
  // the public Auslagen form stays off instead of accidentally exposing it.
  // Vercel sets PUBLIC_FORM_ENABLED=true explicitly when we're ready to ship.
  PUBLIC_FORM_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  /** Canonical public origin (https://folgederwolke-app.vercel.app). Required in prod. */
  PUBLIC_BASE_URL: z.string().default(""),
  /**
   * Public-facing contact email shown in the public Auslagen-form consent text.
   * Build-time PUBLIC_ var: $lib/domain/datenschutz.ts (client-importable) reads
   * it via $env/static/public, NOT via this server-side env object. Declared
   * here too so it is documented + validated alongside the other PUBLIC_ vars.
   */
  PUBLIC_VEREIN_KONTAKT_EMAIL: z.string().default(""),

  // Cron auth
  /** Secret shared between Vercel cron scheduler and the app. */
  CRON_SECRET: z.string().default(""),

  // Org constants
  VEREIN_NAME: z.string().default(""),
  VEREIN_STEUERNUMMER: z.string().default(""),
  VEREIN_VR: z.string().default(""),
  /**
   * Verein postal address — a multi-line German address (DIN 5008), each line
   * on its own row, with an optional care-of line below the name:
   *   "c/o Jonas Hackenberg\nWestermühlstraße 6\n80469 München".
   * Rendered as stacked lines on invoices, the legal pages, and donation
   * certificates; collapsed to one line in compact contexts (mail footer).
   * See $lib/server/domain/address.ts.
   */
  VEREIN_ADRESSE: z.string().default(""),
  /** Verein IBAN for Beitragsreminder + SEPA templates. */
  VEREIN_IBAN: z.string().default(""),
  /** Verein BIC. */
  VEREIN_BIC: z.string().default(""),
  /** Verein Bankname (display). */
  VEREIN_BANK: z.string().default(""),

  // White-label Phase 1 — legal/tax identity fields. All `.default("")` (never
  // `.min(1)`, which would throw at module load and break the CI build).
  // Required-ness for the must-have subset is enforced prod-side in
  // assertProductionEnvSafe() (Phase 4), never via Zod.
  /** Vorstand / Vertretungsberechtigter — legal pages + cert signature line. */
  VEREIN_VORSTAND: z.string().default(""),
  /** Public-facing contact email — legal pages (Impressum/Datenschutz). */
  VEREIN_KONTAKT_EMAIL: z.string().default(""),
  /** Datenschutz-Aufsichtsbehörde (full name + address). */
  VEREIN_AUFSICHTSBEHOERDE: z.string().default(""),
  /** Registergericht (e.g. "Amtsgericht München") — Impressum. */
  VEREIN_REGISTERGERICHT: z.string().default(""),
  /**
   * Full Finanzamt name (e.g. "Finanzamt München"). Rendered verbatim in the
   * Zuwendungsbestätigung Pflichttext — replaces the old city-extraction from
   * the address. Hold the FULL name including the word "Finanzamt".
   */
  VEREIN_FINANZAMT: z.string().default(""),
  /** Default Mitgliedsbeitrag in integer cents (ADR-0003). 0 when unset. */
  VEREIN_BEITRAG_DEFAULT_CENTS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(0),

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
  /**
   * "Steuerbegünstigte Zwecke" listed on the Bescheid (free text). No default
   * (white-label Phase 1): the old FdW-specific default is removed so a fork
   * can never accidentally issue a tax certificate quoting FdW's Satzungszweck.
   * Cert issuance refuses when this is empty (spenden.ts guard).
   */
  VEREIN_STEUERBEGUENSTIGTE_ZWECKE: z.string().default(""),

  // Deployment metadata
  COMMIT_SHA: z.string().default("dev"),
  DEPLOYED_AT: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

/**
 * Parsed service-account credentials extracted from
 * GOOGLE_SERVICE_ACCOUNT_KEY_JSON. `null` when the var is unset (dev/test
 * without Drive). Kept separate from the raw JSON string so callers
 * destructure named fields instead of re-parsing.
 */
export interface ParsedServiceAccount {
  clientEmail: string;
  privateKeyPem: string;
}

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

const rawEnv = loadEnv();

// ---------------------------------------------------------------------------
// Service-account JSON parsing — Phase 9 cutover from OAuth-as-Andy.
//
// The raw JSON literal contains the private key, and any unintended
// JSON.stringify(env) call (log line, error report, telemetry) would dump
// it. We parse it into a structured object exposed at env.googleServiceAccount
// and re-define GOOGLE_SERVICE_ACCOUNT_KEY_JSON as a non-enumerable own
// property so it's invisible to JSON.stringify / for-in / Object.keys, but
// still readable by callers that explicitly reach for it
// (env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON).
// ---------------------------------------------------------------------------

let parsedSa: ParsedServiceAccount | null = null;
if (rawEnv.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
  try {
    const j = JSON.parse(rawEnv.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) as {
      client_email?: unknown;
      private_key?: unknown;
    };
    if (
      typeof j.client_email !== "string" ||
      typeof j.private_key !== "string"
    ) {
      throw new Error("missing client_email or private_key");
    }
    parsedSa = { clientEmail: j.client_email, privateKeyPem: j.private_key };
  } catch (e) {
    throw new Error(
      `Invalid GOOGLE_SERVICE_ACCOUNT_KEY_JSON: ${(e as Error).message}`,
      { cause: e },
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const envWithSafety: any = { ...rawEnv };
// Hide the raw JSON literal AND the parsed credentials from JSON.stringify /
// Object.keys / for-in, but keep both accessible via direct property read.
// This is the safety net for accidental log dumps of `env`: any property
// containing private-key material is invisible to JSON serialization.
delete envWithSafety.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
Object.defineProperty(envWithSafety, "GOOGLE_SERVICE_ACCOUNT_KEY_JSON", {
  enumerable: false,
  configurable: false,
  writable: false,
  value: rawEnv.GOOGLE_SERVICE_ACCOUNT_KEY_JSON,
});
Object.defineProperty(envWithSafety, "googleServiceAccount", {
  enumerable: false,
  configurable: false,
  writable: false,
  value: parsedSa,
});
// Phase 9 review-2 P1: the Vercel Blob read-write token is bearer-credential
// material — anyone holding it can read/write/delete blobs. Apply the same
// non-enumerable shield as GOOGLE_SERVICE_ACCOUNT_KEY_JSON so `JSON.stringify(env)`,
// `for…in`, and `Object.keys(env)` cannot leak it via accidental log dumps.
// Direct reads via `env.BLOB_READ_WRITE_TOKEN` continue to work.
delete envWithSafety.BLOB_READ_WRITE_TOKEN;
Object.defineProperty(envWithSafety, "BLOB_READ_WRITE_TOKEN", {
  enumerable: false,
  configurable: false,
  writable: false,
  value: rawEnv.BLOB_READ_WRITE_TOKEN,
});

export const env = envWithSafety as Env & {
  googleServiceAccount: ParsedServiceAccount | null;
};

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const v = env[key];
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing required env var: ${String(key)}`);
  }
  return v as NonNullable<Env[K]>;
}

/**
 * Public-form gate. Kept as a function (rather than reading env.PUBLIC_FORM_ENABLED
 * directly at every callsite) so we have one place to add future preconditions
 * (e.g. business-hours-only mode, regional restriction).
 *
 * The earlier DPA_GATE_PASSED double-flag was dropped on 2026-05-19 after the
 * pragmatic-rebalance review: Vercel + Neon click-DPAs are enough for a small
 * gemeinnütziger Verein, and a separate env flag was self-imposed bureaucracy.
 * See docs/legal/auftragsverarbeitung/README.md.
 */
export function isPublicFormEnabled(): boolean {
  return env.PUBLIC_FORM_ENABLED;
}

/**
 * Production startup checks. Called from hooks.server.ts. Throws if any
 * required env var would render the app insecure in production. In dev the
 * checks are advisory only.
 */
export function assertProductionEnvSafe(): void {
  const isProd = (process.env["NODE_ENV"] ?? "").toLowerCase() === "production";

  if (isProd) {
    if (env.MAIL_PROVIDER === "dev-eml" || env.MAIL_PROVIDER === "no-op") {
      throw new Error(
        `MAIL_PROVIDER=${env.MAIL_PROVIDER} is dev-only — refusing to run in production`,
      );
    }
    if (env.STORAGE_BACKEND === "local-fs") {
      throw new Error(
        "STORAGE_BACKEND=local-fs is dev-only — Vercel filesystem is ephemeral",
      );
    }
    if (env.STORAGE_BACKEND === "blob" && !env.BLOB_READ_WRITE_TOKEN) {
      throw new Error(
        "BLOB_READ_WRITE_TOKEN is required when STORAGE_BACKEND=blob in production",
      );
    }
    if (!env.googleServiceAccount) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_KEY_JSON is required in production (Drive/Sheets auth)",
      );
    }
  }

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

  // CRON_SECRET unset → Vercel cron endpoints (/api/cron/*) return 401
  // silently. The beitragsreminder job runs once/year (Jan 1) and a missed
  // run wouldn't be noticed for 364 days. Warn loudly at startup instead;
  // don't throw because the rest of the app is still functional and we
  // shouldn't refuse to boot prod over a misconfiguration in scheduled
  // jobs.
  if (isProd && !env.CRON_SECRET && !process.env["CRON_SECRET"]) {
    console.warn(
      "[env] CRON_SECRET is empty in production — /api/cron/* will reject ALL incoming requests, including the legitimate Vercel scheduler. Set via Vercel project env and `gh secret set CRON_SECRET`.",
    );
  }

  // Verein bank-data consistency (cycle-2 expert review F2). Always run —
  // in dev a misconfigured pair is just as wrong as in prod, and the check
  // is a no-op when either value is unset or the BLZ isn't in our table.
  try {
    assertVereinBankConsistent({ iban: env.VEREIN_IBAN, bic: env.VEREIN_BIC });
  } catch (err) {
    if (isProd) throw err;
    console.warn(
      `[env] ${err instanceof Error ? err.message : String(err)} — non-prod, continuing.`,
    );
  }

  // White-label Phase 4 (Task 4.1): VEREIN_NAME + MAIL_FROM are required in
  // production. They carry Zod `.default("")` (NOT `.min(1)`, which would throw
  // at module load and break the CI build); required-ness is enforced here,
  // prod-gated, so the prerender/build (which skips this via `if (!building)`
  // in hooks.server.ts) is unaffected. Appended AFTER the existing checks so
  // order-sensitive tests in env-prod-asserts.test.ts don't shift.
  if (isProd) {
    if (env.VEREIN_NAME.trim() === "") {
      throw new Error(
        "VEREIN_NAME is required in production — it is the Verein identity shown across the app, mail footers, and legal pages. Set it via the Vercel project env.",
      );
    }
    if (env.MAIL_FROM.trim() === "") {
      throw new Error(
        "MAIL_FROM is required in production — it is the From-address of every outgoing email. Set it via the Vercel project env.",
      );
    }
  }
}
