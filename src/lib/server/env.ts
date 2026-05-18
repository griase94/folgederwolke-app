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

  // Org constants
  VEREIN_NAME: z.string().default(""),
  VEREIN_STEUERNUMMER: z.string().default(""),
  VEREIN_VR: z.string().default(""),
  VEREIN_ADRESSE: z.string().default(""),

  // Deployment metadata
  COMMIT_SHA: z.string().default("dev"),
  DEPLOYED_AT: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

// Lazy, defensive load — never throws on import.
// Build-time SSR / prerender sees an empty env; that's OK.
// Runtime callers can `requireEnv("DATABASE_URL")` to fail loudly if missing.
function loadEnv(): Env {
  const result = schema.safeParse(dynEnv);
  if (result.success) return result.data;
  // On any unexpected shape, fall back to all-empty (defaults).
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
