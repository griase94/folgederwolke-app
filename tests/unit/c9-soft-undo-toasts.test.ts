/**
 * @phase-7.5 C9 — UX-050: soft-undo toasts on destructive actions.
 *
 * Every destructive action (archive/delete member, customer, project) should
 * show a success toast that includes an undo action. We assert each Edit*
 * Dialog's delete-form handler wires `action: { label: ..., onClick: ... }`
 * into its toast.success call (the same shape used by TransactionsList's
 * bulk-mark undo).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DESTRUCTIVE = [
  {
    path: "src/lib/components/admin/projects/EditProjectDialog.svelte",
    successToast: "Projekt archiviert",
  },
  {
    path: "src/lib/components/admin/customers/EditCustomerDialog.svelte",
    successToast: "Kunde archiviert",
  },
  {
    path: "src/lib/components/admin/members/EditMemberDialog.svelte",
    successToast: "Mitglied",
  },
];

describe("C9 UX-050 — destructive actions emit soft-undo toasts", () => {
  for (const { path, successToast } of DESTRUCTIVE) {
    it(`${path}: success toast for "${successToast}" includes an undo action`, () => {
      const src = readFileSync(`${process.cwd()}/${path}`, "utf-8");
      // Find the toast.success call that mentions the successToast keyword.
      const re = new RegExp(
        `toast\\.success\\(([^;]|\\n)*?${successToast.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}([^;]|\\n)*?\\)`,
        "m",
      );
      const match = src.match(re);
      expect(
        match,
        `no toast.success("${successToast}") found in ${path}`,
      ).not.toBeNull();
      const block = match?.[0] ?? "";
      // The undo action: a `action: {` object or `Rückgängig` label
      expect(
        /Rückgängig/.test(block) || /action:\s*\{/.test(block),
        `toast in ${path} missing undo action`,
      ).toBe(true);
    });
  }
});
