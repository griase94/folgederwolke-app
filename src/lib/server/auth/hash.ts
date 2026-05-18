/**
 * Hashing utilities for auth tokens.
 * Raw tokens (magic link, session) are NEVER persisted — only SHA-256 hashes.
 */

import { createHash } from "node:crypto";

/** SHA-256 hex digest of a string. Used for token storage (ADR-0009). */
export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
