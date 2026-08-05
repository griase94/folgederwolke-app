/**
 * @phase-7.5 C9 — UX-030 (SLOT-FELD S5: allow-list → repo-wide ban).
 *
 * The Chrome/Edge native date picker formats its placeholder from the input's
 * `lang`. Without it German users see `mm/dd/yyyy` — the single most jarring
 * detail on a German app. The original guard fixed that by requiring
 * `lang="de"` on a HAND-MAINTAINED list of files, plus a second list of files
 * that had been migrated to the `DateField` primitive.
 *
 * Two lists of paths cannot hold: `/app/einstellungen/beitraege` shipped two
 * native `<input type="date">` for years and appeared on NEITHER list, so the
 * guard was green while the page showed `mm/dd/yyyy`. SLOT-FELD migrated it and
 * replaced both lists with the rule the app actually follows:
 *
 *   Native date inputs are BANNED. Dates go through `ui/date-field/DateField`,
 *   which renders a TT.MM.JJJJ text input with an ISO mirror — no browser
 *   locale involved, no `lang` attribute needed, identical on every engine.
 *
 * The only allowed occurrence is inside the primitive itself, where the
 * `type="date"` string lives in a comment explaining why it is not used.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/**
 * The date primitive is the one place the string may appear (in prose, in its
 * header comment). Everything else in `src/` is a finding.
 */
const ALLOWED = ["src/lib/components/ui/date-field/DateField.svelte"];

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...svelteFiles(abs));
    else if (entry.endsWith(".svelte")) out.push(abs);
  }
  return out;
}

/** Every `<input>`/`<Input>` opening tag carrying `type="date"`. */
function nativeDateInputs(src: string): string[] {
  return [
    ...(src.match(/<Input\b[^>]*type="date"[^>]*\/?>/gs) ?? []),
    ...(src.match(/<input\b[^>]*type="date"[^>]*\/?>/gs) ?? []),
  ];
}

describe("C9 UX-030 — no native date inputs anywhere in src/", () => {
  const offenders: { file: string; tags: string[] }[] = [];
  for (const abs of svelteFiles(SRC)) {
    const rel = relative(ROOT, abs);
    if (ALLOWED.includes(rel)) continue;
    const tags = nativeDateInputs(readFileSync(abs, "utf-8"));
    if (tags.length) offenders.push({ file: rel, tags });
  }

  it("every date field goes through the DateField primitive", () => {
    expect(
      offenders.map((o) => o.file),
      'native <input type="date"> found — use $lib/components/ui/date-field/DateField.svelte ' +
        '(TT.MM.JJJJ + ISO mirror) instead; a `lang="de"` band-aid is not enough',
    ).toEqual([]);
  });

  it("the scan actually reaches the source tree (self-test)", () => {
    // A rule that silently scans nothing is worse than no rule: pin that the
    // walker sees a realistic number of components and that its detector fires
    // on a synthetic offender.
    expect(svelteFiles(SRC).length).toBeGreaterThan(100);
    expect(nativeDateInputs('<input name="x" type="date" />')).toHaveLength(1);
    expect(nativeDateInputs('<input name="x" type="text" />')).toHaveLength(0);
  });
});
