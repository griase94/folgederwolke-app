/**
 * @phase-7.5 C9 — UX-020: honest submit-button labels.
 *
 * Generic "Hinzufügen" / "Speichern" labels don't tell the user what the
 * button actually does. This test reads each add-form and asserts the
 * submit button uses the entity-specific label.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CASES: Array<{ path: string; expectedLabel: string }> = [
  {
    // C2/S3c: AddMemberDialog + EditMemberDialog consolidated into MemberDialog
    // (mode add|edit). The add CTA keeps the honest "Mitglied anlegen" label.
    path: "src/lib/components/admin/members/MemberDialog.svelte",
    expectedLabel: "Mitglied anlegen",
  },
  {
    // Aurora E1: kit-modal restyle — submit label singularised to match the
    // modal-kunde-v4 plate ("Kunde anlegen").
    path: "src/lib/components/admin/customers/AddCustomerDialog.svelte",
    expectedLabel: "Kunde anlegen",
  },
  {
    path: "src/lib/components/admin/projects/AddProjectDialog.svelte",
    expectedLabel: "Projekt anlegen",
  },
  // Phase 6 (Tier C3): AddSpendeDialog retired; the Spenden create form's honest
  // submit label ("Speichern") lives on the EntryFormShell-based /app/spenden/neu.
  {
    path: "src/lib/components/admin/invoices/InvoiceForm.svelte",
    expectedLabel: "Rechnung erstellen & PDF",
  },
];

describe("C9 UX-020 — honest submit-button labels", () => {
  for (const { path, expectedLabel } of CASES) {
    it(`${path} submit button uses "${expectedLabel}"`, () => {
      const src = readFileSync(`${process.cwd()}/${path}`, "utf-8");
      expect(src).toContain(expectedLabel);
    });
  }

  it("MemberDialog does NOT still use the generic 'Hinzufügen' label on its submit", () => {
    const src = readFileSync(
      `${process.cwd()}/src/lib/components/admin/members/MemberDialog.svelte`,
      "utf-8",
    );
    // The submit button line should not contain "Hinzufügen" — search after the
    // last `type="submit"` occurrence.
    const submitIdx = src.lastIndexOf('type="submit"');
    expect(submitIdx).toBeGreaterThan(0);
    const tail = src.slice(submitIdx);
    // The button body comes right after the Button opening tag; the literal
    // text "Hinzufügen" should be gone.
    expect(tail).not.toContain("Hinzufügen");
  });
});
