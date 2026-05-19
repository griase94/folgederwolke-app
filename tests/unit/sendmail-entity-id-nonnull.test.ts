/**
 * @phase-7.5
 *
 * Regression net for the sent_mails dedup collision bug discovered while
 * running the app locally on 2026-05-19: every `sendMail({ entity_id: null })`
 * call collided with the first row that ever shipped with entity_id=null,
 * because the `UNIQUE(template, entity_kind, entity_id, send_attempt)` index
 * was created with `NULLS NOT DISTINCT` in migration 0003.
 *
 * Test-coverage review CG-3 flagged this as an unprotected hazard. Until we
 * either rebuild the index without NULLS NOT DISTINCT or harden sendMail to
 * synthesize a UUID when entity_id is null, the simplest defence is to keep
 * every caller honest at the source level.
 *
 * If you genuinely need a deduplication anchor on something that isn't a
 * concrete entity (e.g. system-wide notifications), use a UUIDv4 you persist
 * elsewhere instead of `null`.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// vitest sets CWD to the project root.
const SRC_ROOT = join(process.cwd(), "src");

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip node_modules / build dirs the walker might encounter via symlinks
      if (entry.name === "node_modules" || entry.name === ".svelte-kit")
        continue;
      yield* walk(full);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte"))
    ) {
      yield full;
    }
  }
}

describe("sendMail call sites — entity_id must never be null", () => {
  it("no production code passes entity_id: null to sendMail()", async () => {
    const offenders: string[] = [];

    // Stat first to fail loudly if the path is wrong (CI on a different
    // checkout layout would otherwise silently pass with zero matches).
    await stat(SRC_ROOT);

    for await (const file of walk(SRC_ROOT)) {
      // Skip test files: they intentionally exercise the dedup path.
      if (file.endsWith(".test.ts")) continue;
      // Skip the public sendMail signature itself.
      if (file.endsWith("/mail/index.ts")) continue;

      const src = await readFile(file, "utf-8");

      // Approximate match: a sendMail call (multi-line) followed by
      // `entity_id: null` in the same call expression. We accept some
      // false positives — but the codebase has zero legitimate uses, so
      // any match is a bug to investigate.
      const callRegex = /sendMail\s*\(\s*\{[^}]*?entity_id\s*:\s*null/gs;
      if (callRegex.test(src)) {
        offenders.push(file.replace(SRC_ROOT, "src"));
      }
    }

    expect(offenders).toEqual([]);
  });
});
