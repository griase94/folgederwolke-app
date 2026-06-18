/**
 * @phase-2 Task E.2 — MarkPaidControl forwards paidCents + notes to the POST.
 *
 * MarkPaidControl is a wrapper that owns the fetch POST. We can't easily run
 * it in jsdom (fetch + navigation), so these tests verify the POST helper
 * builds the FormData with paidCents and notes fields. We test the
 * `post` function directly by extracting the form-field names from
 * what MarkPaidPopover's onPaid callback emits.
 *
 * Concretely: we spy on global fetch and assert the FormData it receives
 * contains paidCents and notes when MarkPaidControl posts to mark-beitrag-paid.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/svelte";
import MarkPaidControl from "./MarkPaidControl.svelte";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const base = {
  memberId: "m1",
  year: 2025,
  memberName: "Erika Mustermann",
  betragCents: 6969,
  paidCents: 0,
  open: true,
  actionBase: "",
};

/** Capture the FormData sent to fetch and return a SvelteKit success response. */
function mockFetch(): { getBody: () => FormData } {
  let body: FormData | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      body = init?.body as FormData;
      return new Response(
        JSON.stringify({ type: "success", status: 200, data: {} }),
        { status: 200, headers: { "content-type": "text/plain" } },
      );
    }),
  );
  return {
    getBody: () => {
      if (!body) throw new Error("fetch was not called");
      return body;
    },
  };
}

describe("MarkPaidControl — forwards paidCents and notes (Package E)", () => {
  it("POSTs paidCents from the popover Betrag input", async () => {
    const { getBody } = mockFetch();

    render(MarkPaidControl, { props: { ...base, open: true } });

    // Fill Betrag with a partial amount
    const betragInput = screen.getByLabelText("Betrag (€)") as HTMLInputElement;
    await fireEvent.input(betragInput, { target: { value: "30,00" } });
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));

    expect(fetch).toHaveBeenCalled();
    expect(getBody().get("paidCents")).toBe("3000");
  });

  it("POSTs notes from the popover Notiz input", async () => {
    const { getBody } = mockFetch();

    render(MarkPaidControl, { props: { ...base, open: true } });

    const notizInput = screen.getByLabelText(
      "Notiz (optional)",
    ) as HTMLInputElement;
    await fireEvent.input(notizInput, { target: { value: "Überweisung" } });
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));

    expect(fetch).toHaveBeenCalled();
    expect(getBody().get("notes")).toBe("Überweisung");
  });

  it("POSTs notes as empty string when Notiz is blank", async () => {
    const { getBody } = mockFetch();

    render(MarkPaidControl, { props: { ...base, open: true } });

    // Leave Notiz empty, just click Bezahlt
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));

    expect(fetch).toHaveBeenCalled();
    // notes field must be present (empty string when nothing entered)
    expect(getBody().has("notes")).toBe(true);
  });
});
