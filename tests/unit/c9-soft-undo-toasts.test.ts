/**
 * @phase-7.5 C9 — UX-050: soft-undo toasts on destructive actions.
 *
 * Every destructive action (archive/delete member, customer, project) should
 * show a success toast that includes an undo action. Two accepted shapes:
 *  - `toast.success("… <keyword> …", { action: { label, onClick } })` (the
 *    original inline pattern), OR
 *  - the shared `undoToast("… <keyword> …", { onUndo })` primitive (Aurora F1),
 *    which renders the same 8s "Rückgängig" snack.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DESTRUCTIVE = [
  {
    path: "src/lib/components/admin/projects/EditProjectDialog.svelte",
    keyword: "archiviert",
  },
  {
    path: "src/lib/components/admin/customers/EditCustomerDialog.svelte",
    keyword: "archiviert",
  },
  {
    path: "src/lib/components/admin/members/EditMemberDialog.svelte",
    keyword: "Mitglied",
  },
];

describe("C9 UX-050 — destructive actions emit soft-undo toasts", () => {
  for (const { path, keyword } of DESTRUCTIVE) {
    it(`${path}: archive toast includes an undo action`, () => {
      const src = readFileSync(`${process.cwd()}/${path}`, "utf-8");
      const esc = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Match either toast.success(...) or undoToast(...) carrying the keyword.
      const re = new RegExp(
        `(toast\\.success|undoToast)\\(([^;]|\\n)*?${esc}([^;]|\\n)*?\\)`,
        "m",
      );
      const match = src.match(re);
      expect(
        match,
        `no soft-undo toast mentioning "${keyword}" found in ${path}`,
      ).not.toBeNull();
      const block = match?.[0] ?? "";
      expect(
        /Rückgängig/.test(block) ||
          /action:\s*\{/.test(block) ||
          /onUndo/.test(block),
        `toast in ${path} missing undo action`,
      ).toBe(true);
    });
  }
});
