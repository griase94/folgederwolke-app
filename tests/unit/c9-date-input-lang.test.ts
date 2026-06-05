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

// C6-FORM (Night-2 E4) migrated 6 of these files to the DateField primitive
// (which renders a TT.MM.JJJJ text input — `type="date"` is gone). We keep
// the lang="de" guard on the files that still ship native `<input type="date">`
// (transactions/{neu}'s donation + income branches, project dialogs, and a
// handful of admin-only utilities that aren't on the consumer-migration list).
const FILES = [
  "src/lib/components/admin/inbox/ManualImportSheet.svelte",
  "src/lib/components/admin/projects/AddProjectDialog.svelte",
  "src/lib/components/admin/projects/EditProjectDialog.svelte",
  // Phase 4 (Tier C1) moved the bulk/SEPA components into `…/transactions/ausgaben/`.
  "src/lib/components/admin/transactions/ausgaben/PostSepaMarkErstattetModal.svelte",
  "src/lib/components/admin/transactions/TransactionEditForm.svelte",
  "src/lib/components/admin/transactions/ausgaben/BulkActionsBar.svelte",
  "src/lib/components/admin/members/AddMemberDialog.svelte",
  // Phase 8 T6: src/routes/app/transactions/neu/+page.svelte deleted.
  // The per-tab routes (ausgaben/neu, einnahmen/neu, spenden/neu) have their
  // own date inputs and should be audited separately if they use native date inputs.
];

// Files migrated to DateField under E4 — sanity-checked separately by
// tests/unit/c6-form-consumers.test.ts. These should NOT have any native
// `type="date"` inputs left.
// Phase 6 (Tier C3) retired AddSpendeDialog/EditSpendeDialog with the old
// /app/transactions/spenden route, so they are no longer in this guard.
const MIGRATED_FILES = [
  "src/lib/components/forms/AuslagenForm.svelte",
  "src/lib/components/admin/invoices/InvoiceForm.svelte",
  "src/lib/components/admin/members/EditMemberDialog.svelte",
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

  // E4 migration guard — these files MUST no longer ship a native
  // `<input type="date">`. They use DateField for date inputs instead.
  for (const path of MIGRATED_FILES) {
    it(`${path}: no native type="date" inputs remain (migrated to DateField)`, () => {
      const src = readFileSync(`${process.cwd()}/${path}`, "utf-8");
      const dateInputs = src.match(/<Input\b[^>]*type="date"[^>]*\/?>/gs) ?? [];
      const rawDateInputs =
        src.match(/<input\b[^>]*type="date"[^>]*\/?>/gs) ?? [];
      expect(dateInputs.length + rawDateInputs.length).toBe(0);
    });
  }
});
