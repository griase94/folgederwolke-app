/**
 * @phase-7.5 C9 — UX-021: every empty list has a CTA in its empty state.
 *
 * NoEntries supports an `action` snippet. Lists that have an "add" entity
 * should pass an action with a primary button so the user has one obvious
 * next step from the empty state alone.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LISTS = [
  "src/lib/components/admin/members/MemberList.svelte",
  "src/lib/components/admin/customers/CustomerList.svelte",
  "src/lib/components/admin/projects/ProjectList.svelte",
  "src/lib/components/admin/invoices/InvoiceList.svelte",
  "src/lib/components/admin/spenden/SpendenList.svelte",
];

describe("C9 UX-021 — empty-state CTAs in list components", () => {
  for (const path of LISTS) {
    it(`${path} renders an action CTA in its empty state`, () => {
      const src = readFileSync(`${process.cwd()}/${path}`, "utf-8");
      // Either the file uses NoEntries with an `action` snippet, OR it has
      // its own hand-rolled empty state with a button.
      const usesNoEntriesAction =
        src.includes("<NoEntries") && /\{#snippet\s+action\(\)\}/.test(src);
      const hasInlineCtaButton =
        // hand-rolled empty state markup containing a button or link to /neu
        /(empty-state|empty)/.test(src) &&
        /<(Button|button|a)\b[^>]*>[^<]*(anlegen|hinzufügen|erfassen)/i.test(
          src,
        );
      expect(
        usesNoEntriesAction || hasInlineCtaButton,
        `${path} has no inline CTA in empty state`,
      ).toBe(true);
    });
  }
});
