/**
 * Drive module barrel.
 *
 * Phase 9: Drive file CRUD (upload/download/archive) has moved to Vercel Blob
 * via `$lib/server/files/storage.js`. This barrel now only re-exports the
 * pieces still in use: SA-based auth (used by sheets-client + /healthz) and
 * the retry/error helpers consumed by the sheets reader.
 */
export { getDriveAuth } from "./auth.js";
export { withDriveRetry } from "./retry.js";
export {
  DriveError,
  DriveAuthError,
  DriveQuotaError,
  DriveRateLimitError,
  DriveNotFoundError,
} from "./types.js";
