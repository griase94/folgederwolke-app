/**
 * VercelBlobFileStorage tests — Phase 9.
 *
 * The full FileStorage conformance suite runs against a real Vercel Blob
 * store, which requires a write-capable token. CI provides
 * `BLOB_READ_WRITE_TOKEN_CI` against a dedicated CI-test Blob store; locally
 * Andy runs this manually once per change to the impl. Without the token the
 * suite is skipped (so this file is safe to import in any environment) but
 * the impl is still type-checked on every `pnpm check`.
 */

import { describe, it } from "vitest";
import { runConformanceSuite } from "./storage.conformance.js";
import { VercelBlobFileStorage } from "./vercel-blob-impl.js";

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN_CI;

(TOKEN ? describe : describe.skip)("real Vercel Blob (token-gated)", () => {
  runConformanceSuite(
    "vercel-blob",
    () => new VercelBlobFileStorage({ token: TOKEN! }),
  );
});

(!TOKEN ? it : it.skip)(
  "skipped — no BLOB_READ_WRITE_TOKEN_CI in env",
  () => {},
);
