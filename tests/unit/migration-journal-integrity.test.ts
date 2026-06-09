import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DB-free guard against the migration-journal corruption class.
 *
 * Root cause it defends (PR #92, prod 500 on /app + /app/mitglieder): the
 * Drizzle postgres-js migrator applies a journal entry iff
 *   entry.when (folderMillis) > MAX(created_at) in drizzle.__drizzle_migrations
 * computed ONCE before the apply loop (see node_modules/drizzle-orm/pg-core/
 * dialect.cjs `migrate()`). So a NON-MONOTONIC `when` — an entry whose `when`
 * is smaller than an earlier-applied entry's — is SILENTLY SKIPPED on the real
 * incremental prod path. On a fresh/empty DB the high-water mark is undefined,
 * so every migration applies regardless of `when` — which is exactly why
 * fresh-DB CI (reset-test-db.sh) never catches this. This test runs with no DB
 * and would have failed PR #92 at the unit-and-types stage.
 *
 * RULE (CLAUDE.md): never hand-edit _journal.json. `pnpm drizzle-kit generate`
 * owns the journal entry + its `when`. A one-time repair must keep `when`
 * strictly monotonic by idx and > the live prod MAX(created_at).
 */

const repoRoot = resolve(__dirname, "..", "..");
const drizzleDir = resolve(repoRoot, "drizzle");
const journalPath = resolve(drizzleDir, "meta", "_journal.json");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}
interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;
const entries = journal.entries;

// Sane window for a `when` epoch-ms value. Lower bound is a project floor
// (2025-01-01) that rejects 0 / garbage; upper bound rejects far-future
// fat-fingers. The wrong-YEAR regression itself is caught by the strict
// monotonicity test below, not by this window.
const MIN_WHEN = Date.UTC(2025, 0, 1); // 1735689600000
const MAX_WHEN = Date.now() + 86_400_000; // now + 1 day of slack

describe("migration journal integrity", () => {
  it("has at least one entry and is a postgresql v7 journal", () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(journal.dialect).toBe("postgresql");
  });

  it("idx values are contiguous 0..N-1 in array order", () => {
    const idxs = entries.map((e) => e.idx);
    expect(idxs).toEqual(entries.map((_, i) => i));
  });

  it("`when` is STRICTLY increasing by idx (the migrator skip guard)", () => {
    const offenders: string[] = [];
    for (let i = 1; i < entries.length; i++) {
      const prev = entries[i - 1]!;
      const cur = entries[i]!;
      if (!(cur.when > prev.when)) {
        offenders.push(
          `idx ${cur.idx} (${cur.tag}) when=${cur.when} is not > idx ${prev.idx} (${prev.tag}) when=${prev.when} — the migrator would SKIP it on prod's incremental apply`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("`when` values are unique", () => {
    const whens = entries.map((e) => e.when);
    expect(new Set(whens).size).toBe(whens.length);
  });

  it("every `when` is within the sane epoch-ms window", () => {
    const bad = entries
      .filter((e) => e.when < MIN_WHEN || e.when > MAX_WHEN)
      .map((e) => `idx ${e.idx} (${e.tag}) when=${e.when}`);
    expect(
      bad,
      `out-of-window when values (allowed [${MIN_WHEN}, ${MAX_WHEN}]):\n${bad.join("\n")}`,
    ).toEqual([]);
  });

  it("tags are unique", () => {
    const tags = entries.map((e) => e.tag);
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("every journal tag has a matching drizzle/<tag>.sql file", () => {
    const sqlFiles = new Set(
      readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")),
    );
    const missing = entries
      .map((e) => `${e.tag}.sql`)
      .filter((f) => !sqlFiles.has(f));
    expect(
      missing,
      `journal tags with no .sql file: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("has no orphan drizzle/*.sql file that the journal does not list", () => {
    const tagFiles = new Set(entries.map((e) => `${e.tag}.sql`));
    const orphans = readdirSync(drizzleDir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => !tagFiles.has(f));
    expect(
      orphans,
      `.sql files not referenced by the journal (would never be applied): ${orphans.join(", ")}`,
    ).toEqual([]);
  });
});
