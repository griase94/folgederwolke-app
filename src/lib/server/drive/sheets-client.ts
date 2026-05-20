/**
 * Sheets v4 client wrapper — Phase 9.
 *
 * One small adapter so importer + finance-sheet readers share a single
 * construction path. The `as any` cast is needed because @googleapis/sheets
 * types its `auth` field narrowly to OAuth2Client while we pass a
 * GoogleAuth (service-account). At runtime google-auth-library normalizes
 * both, so the cast is safe.
 */
import { sheets as createSheets } from "@googleapis/sheets";
import { getDriveAuth } from "./auth.js";

export function getSheetsClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createSheets({ version: "v4", auth: getDriveAuth() as any });
}
