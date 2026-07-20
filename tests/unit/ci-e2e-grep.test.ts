import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Cycle 3 — F3: lock in the contract that `.github/workflows/ci.yml`'s e2e
 * grep covers every tag we ship tests under.
 *
 * Background: CI runs `pnpm test:e2e --grep '@phase-0|@phase-1|@phase-2'`.
 * Before the F3 fix the PWA share_target spec was tagged @phase-7 and
 * silently never executed in CI — the share_target prod-build regression
 * (F1) could land any time without anyone noticing. This test guards
 * against a recurrence: any new untagged or off-grep critical-path test
 * fails the unit-and-types job locally and on PR before the e2e job even
 * spins up.
 */

const repoRoot = resolve(__dirname, "..", "..");
const ciYmlPath = resolve(repoRoot, ".github", "workflows", "ci.yml");
const e2eDir = resolve(repoRoot, "tests", "e2e");

function extractCiGrep(ciYml: string): string[] {
  const m = ciYml.match(/--grep\s+'([^']+)'/);
  if (!m) throw new Error("could not find --grep in ci.yml");
  return m[1]!.split("|").map((t) => t.trim());
}

function extractDescribeTags(specSrc: string): string[] {
  const tags: string[] = [];
  // Accept plain test.describe(), .serial(), .only(), .skip(), .parallel(),
  // and tolerate line-breaks between `test.describe` and the chained modifier
  // (Prettier formats `test.describe.serial("...")` onto two lines when the
  // title is long). The (?:\s*\.\w+)? bit handles both.
  const re = /test\.describe(?:\s*\.\s*\w+)?\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = re.exec(specSrc)) !== null) {
    const title = m[1]!;
    const tag = title.match(/@[a-z0-9-]+/i);
    if (tag) tags.push(tag[0]);
  }
  return tags;
}

describe("CI e2e grep coverage (F3)", () => {
  const ciYml = readFileSync(ciYmlPath, "utf8");
  const grepTags = extractCiGrep(ciYml);

  it("ci.yml e2e grep declares the core phase tags", () => {
    expect(grepTags).toContain("@phase-0");
    expect(grepTags).toContain("@phase-1");
    expect(grepTags).toContain("@phase-2");
    // Bare @phase-3 (admin-shell/mitglieder/member-detail/beitraege-matrix) is
    // distinct from @phase-3-routing — main's gate, restored after the resync.
    expect(grepTags).toContain("@phase-3");
    // Three-tab phases added in FIX-1:
    expect(grepTags).toContain("@phase-3-routing");
    expect(grepTags).toContain("@phase-4-ausgaben");
    expect(grepTags).toContain("@phase-5-einnahmen");
    expect(grepTags).toContain("@phase-6-spenden");
    expect(grepTags).toContain("@phase-8");
    expect(grepTags).toContain("@phase-9");
    // @smoke added from main: cross-cutting always-on authenticated-route check.
    expect(grepTags).toContain("@smoke");
    // Aurora UI redesign slices (2026-06): each slice adds its tag at its
    // PR boundary (spec §10 testing norms).
    expect(grepTags).toContain("@phase-aurora-1");
    expect(grepTags).toContain("@phase-aurora-slice2");
    // Aurora slice 3 (login & public flow) — boundary suite runs in CI.
    expect(grepTags).toContain("@phase-aurora-slice3");
    // Aurora slice 4 (dashboard + Überweisungsliste) — boundary suite runs in CI.
    expect(grepTags).toContain("@phase-aurora-slice4");
    // Aurora inbox redesign:
    expect(grepTags).toContain("@phase-aurora-inbox");
    // Member Beiträge-Zahlung redesign (Package F boundary — member-detail +
    // mitglieder specs, tag @phase-member-zahlung):
    expect(grepTags).toContain("@phase-member-zahlung");
    // Entry-modals redesign + Beleg enforcement boundary suite:
    expect(grepTags).toContain("@phase-entry-modals");
    // Aurora implementation campaign — F1 foundation (tokens, dark, primitives):
    expect(grepTags).toContain("@aurora-impl-f1");
    // Aurora implementation campaign — F2 dataviz (chart family + dashboard):
    expect(grepTags).toContain("@aurora-impl-f2");
  });

  it("PWA share_target spec is covered by the CI grep (F3)", () => {
    const pwaSpec = readFileSync(resolve(e2eDir, "pwa.spec.ts"), "utf8");
    const pwaTags = extractDescribeTags(pwaSpec);
    expect(pwaTags.length).toBeGreaterThan(0);
    const covered = pwaTags.some((t) => grepTags.includes(t));
    expect(
      covered,
      `pwa.spec.ts describe tag(s) ${JSON.stringify(pwaTags)} not in CI grep ${JSON.stringify(grepTags)}`,
    ).toBe(true);
  });

  // The set of "release-critical" specs that MUST be covered by every CI run.
  // PWA is on this list because the share_target POST is the primary
  // untrusted-origin entry point into the public Auslage form (CSRF-bypass
  // surface). Three-tab specs added in FIX-1 so a future grep drop is caught.
  // smoke-authed-routes is here because it is the only always-on check that
  // every authenticated /app section renders without a 5xx — the net for the
  // route-crash class. Bare @phase-3 specs (main's coverage, restored after the
  // resync). Add others here as new critical-path entry points ship.
  const criticalSpecs = [
    "pwa.spec.ts",
    "smoke-authed-routes.spec.ts",
    "admin-shell.spec.ts",
    "mitglieder.spec.ts",
    "member-detail.spec.ts",
    "beitraege-matrix-flows.spec.ts",
    "phase-3-routing.spec.ts",
    "phase-4-ausgaben.spec.ts",
    "phase-5-einnahmen.spec.ts",
    "phase-6-spenden.spec.ts",
    "phase-8-export-download.spec.ts",
    "phase-8-axe-a11y.spec.ts",
    "c7-inbox-filter-actions.spec.ts",
    // Beleg enforcement + modal isolation boundary (entry-modals):
    "entry-modals.spec.ts",
    // Aurora impl campaign — F1 foundation (dark toggle + env branding):
    "aurora-impl-f1.spec.ts",
    // Aurora impl campaign — F2 dataviz (dashboard sparkline hero + hover):
    "aurora-impl-f2.spec.ts",
  ];

  it("every release-critical spec has at least one tag in the CI grep", () => {
    const failures: string[] = [];
    for (const spec of criticalSpecs) {
      const src = readFileSync(resolve(e2eDir, spec), "utf8");
      const tags = extractDescribeTags(src);
      if (tags.length === 0) {
        failures.push(`${spec}: no @-tag found on any test.describe()`);
        continue;
      }
      if (!tags.some((t) => grepTags.includes(t))) {
        failures.push(
          `${spec}: tags ${JSON.stringify(tags)} not in CI grep ${JSON.stringify(grepTags)}`,
        );
      }
    }
    expect(failures).toEqual([]);
  });

  // Belt-and-braces sanity: walk the whole e2e directory and confirm that
  // any spec we ship has at least one describe-tag (uncovered files would
  // never be greppable). Informational on the tags-vs-grep diff.
  it("every e2e spec declares at least one @-tagged describe block", () => {
    const specs = readdirSync(e2eDir).filter((f) => f.endsWith(".spec.ts"));
    const untagged: string[] = [];
    for (const spec of specs) {
      const src = readFileSync(resolve(e2eDir, spec), "utf8");
      const tags = extractDescribeTags(src);
      if (tags.length === 0) untagged.push(spec);
    }
    expect(
      untagged,
      `the following e2e specs have no tagged describe block and will never run in CI: ${untagged.join(", ")}`,
    ).toEqual([]);
  });
});
