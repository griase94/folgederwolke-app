/**
 * Drive / Sheets auth — Phase 9 service-account path.
 *
 * Replaces the previous OAuth-as-Andy / refresh-token flow with a Google
 * service account whose credentials live in env.googleServiceAccount
 * (parsed from GOOGLE_SERVICE_ACCOUNT_KEY_JSON). The auth client is a
 * lazy singleton — google-auth-library handles token caching + refresh.
 *
 * Scopes are read-only for spreadsheets; the SA does not write to Drive
 * or Docs in Phase 9+. Belege live in Vercel Blob (see files/storage.ts).
 */
import { GoogleAuth } from "google-auth-library";
import { env } from "$lib/server/env.js";

let _auth: GoogleAuth | null = null;

/**
 * Returns a singleton GoogleAuth client built from the service-account
 * credentials parsed by env.ts. Throws when GOOGLE_SERVICE_ACCOUNT_KEY_JSON
 * is unset — callers in dev that don't need Drive should check
 * env.googleServiceAccount first.
 */
export function getDriveAuth(): GoogleAuth {
  if (_auth) return _auth;
  if (!env.googleServiceAccount) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_JSON not configured");
  }
  _auth = new GoogleAuth({
    credentials: {
      client_email: env.googleServiceAccount.clientEmail,
      private_key: env.googleServiceAccount.privateKeyPem,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return _auth;
}
