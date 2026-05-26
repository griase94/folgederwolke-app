/**
 * C6-FORM consumer migrations — Night 2 E4
 *
 * Source-grep test that every form listed in scope replaced its native
 * `<input type="date">` (or `<Input type="date">`) with the `DateField`
 * primitive shipped Night-1 in `src/lib/components/ui/date-field/`.
 *
 * Why source inspection: the DateField primitive itself has thorough runtime
 * tests in `tests/unit/DateField.test.ts` (placeholder, ISO mirror, invalid
 * date handling). The wiring contract verified here is "this consumer has
 * actually been migrated" — checking that no native `type="date"` input
 * remains in scope, that the DateField import exists, and that DateField
 * is invoked for each migrated field by name.
 *
 * Runtime keyboard-input → ISO server-payload coverage lives in
 * `tests/e2e/forms/c6-form-consumers-e2e.spec.ts` (@phase-9).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(`${ROOT}/${rel}`, "utf-8");
}

/**
 * The set of files (and their date-field names) migrated under this PR.
 * Format: relative path → list of date field names that MUST appear inside
 * a `<DateField ... name="<field>" .../>` invocation.
 */
const MIGRATIONS: ReadonlyArray<{
  file: string;
  fields: readonly string[];
}> = [
  {
    file: "src/lib/components/forms/AuslagenForm.svelte",
    fields: ["rechnungsdatum"],
  },
  {
    file: "src/routes/app/transactions/neu/+page.svelte",
    fields: ["rechnungsdatum", "abfluss_datum"],
  },
  {
    file: "src/lib/components/admin/invoices/InvoiceForm.svelte",
    fields: ["rechnungsdatum", "leistungsDatum", "faelligkeitsDatum"],
  },
  {
    file: "src/lib/components/admin/members/EditMemberDialog.svelte",
    fields: ["date_of_birth", "eintritts_datum"],
  },
  {
    file: "src/lib/components/admin/spenden/AddSpendeDialog.svelte",
    fields: ["zugewendet_am"],
  },
  {
    file: "src/lib/components/admin/spenden/EditSpendeDialog.svelte",
    fields: ["zugewendet_am"],
  },
];

describe("C6-FORM consumer migrations — Night 2 E4", () => {
  for (const { file, fields } of MIGRATIONS) {
    describe(file, () => {
      it('no native type="date" inputs remain for migrated fields', () => {
        const src = read(file);
        for (const field of fields) {
          // `<input … type="date" … name="field" …>` or
          // `<Input … type="date" … name="field" …>` would survive the migration.
          // Allow surrounding whitespace/attrs to be in any order.
          const nativeRe = new RegExp(
            String.raw`<[Ii]nput\b[^>]*type=["']date["'][^>]*name=["']` +
              field +
              String.raw`["'][^>]*>`,
            "s",
          );
          const reverseRe = new RegExp(
            String.raw`<[Ii]nput\b[^>]*name=["']` +
              field +
              String.raw`["'][^>]*type=["']date["'][^>]*>`,
            "s",
          );
          expect(
            nativeRe.test(src),
            `${file}: native <input type="date" name="${field}"> still present`,
          ).toBe(false);
          expect(
            reverseRe.test(src),
            `${file}: native <input name="${field}" type="date"> still present`,
          ).toBe(false);
        }
      });

      it("imports DateField primitive", () => {
        const src = read(file);
        expect(
          src.includes("$lib/components/ui/date-field"),
          `${file}: DateField import missing`,
        ).toBe(true);
      });

      it("invokes <DateField …/> for each migrated field name", () => {
        const src = read(file);
        for (const field of fields) {
          // DateField invocation carrying name="<field>" (any order of attrs).
          const re = new RegExp(
            String.raw`<DateField\b[^>]*name=["']` +
              field +
              String.raw`["']|<DateField\b[^>]*name=\{["']?` +
              field +
              String.raw`["']?\}`,
            "s",
          );
          // Also accept the case where DateField is invoked inside a #each
          // or other dynamic context with the name resolved at render time —
          // we tolerate a `name={` binding to a known token. To keep this
          // strict for the simple cases, require either a literal name= attr
          // or a name={…} binding referencing the field name as a string.
          expect(
            re.test(src),
            `${file}: no <DateField name="${field}" …/> invocation found`,
          ).toBe(true);
        }
      });
    });
  }

  it("DateField primitive still hardcodes TT.MM.JJJJ placeholder (Plan-1 contract)", () => {
    const src = read("src/lib/components/ui/date-field/DateField.svelte");
    expect(src).toMatch(/placeholder=["']TT\.MM\.JJJJ["']/);
  });

  it("no consumer passes a placeholder=… override (E4.0 verification)", () => {
    for (const { file } of MIGRATIONS) {
      const src = read(file);
      // Find every <DateField …/> invocation and ensure none carries
      // placeholder=… (the hardcoded primitive default must apply).
      const dateFieldTags = src.match(/<DateField\b[^>]*\/?>/gs) ?? [];
      for (const tag of dateFieldTags) {
        expect(
          /placeholder\s*=/.test(tag),
          `${file}: <DateField …/> must not pass a placeholder override (got: ${tag})`,
        ).toBe(false);
      }
    }
  });
});
