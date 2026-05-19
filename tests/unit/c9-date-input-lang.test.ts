/**
 * @phase-7.5 C9 — UX-030: every `<input type="date">` carries `lang="de"`.
 *
 * The Chrome/Edge native date picker honours the input's `lang` attribute for
 * placeholder formatting. Without it German users see `mm/dd/yyyy` — the
 * single most jarring detail on a German app. This test scans the source
 * tree and fails if any `type="date"` input is missing `lang="de"`.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "src/lib/components/admin/inbox/ManualImportSheet.svelte",
  "src/lib/components/admin/projects/AddProjectDialog.svelte",
  "src/lib/components/admin/projects/EditProjectDialog.svelte",
  "src/lib/components/admin/invoices/InvoiceForm.svelte",
  "src/lib/components/admin/spenden/EditSpendeDialog.svelte",
  "src/lib/components/admin/spenden/AddSpendeDialog.svelte",
  "src/lib/components/admin/transactions/PostSepaMarkErstattetModal.svelte",
  "src/lib/components/admin/transactions/TransactionEditForm.svelte",
  "src/lib/components/admin/transactions/BulkActionsBar.svelte",
  "src/lib/components/admin/members/AddMemberDialog.svelte",
  "src/lib/components/admin/members/EditMemberDialog.svelte",
  "src/routes/app/transactions/neu/+page.svelte",
];

describe('C9 UX-030 — every type="date" input has lang="de"', () => {
  for (const path of FILES) {
    it(`${path}: every date input is lang="de"`, () => {
      const src = readFileSync(`${process.cwd()}/${path}`, "utf-8");

      // Find every input tag containing type="date" — match the whole tag
      // (including multi-line attributes). The regex is intentionally loose
      // since Svelte attributes can be in any order.
      const dateInputs = src.match(/<Input\b[^>]*type="date"[^>]*\/?>/gs) ?? [];
      const rawDateInputs =
        src.match(/<input\b[^>]*type="date"[^>]*\/?>/gs) ?? [];
      const all = [...dateInputs, ...rawDateInputs];

      expect(all.length).toBeGreaterThan(0);

      for (const tag of all) {
        expect(tag, `missing lang="de" on date input in ${path}`).toMatch(
          /lang="de"/,
        );
      }
    });
  }
});
