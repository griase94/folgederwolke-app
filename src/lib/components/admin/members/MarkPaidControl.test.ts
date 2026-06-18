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

describe("MarkPaidControl — forwards paidCents and notes (Package E)", () => {
  it("POSTs paidCents from the popover Betrag input", async () => {
    // Capture the FormData that fetch receives
    let capturedBody: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body as FormData;
        // Return a valid SvelteKit action success response
        return new Response(
          JSON.stringify({ type: "success", status: 200, data: {} }),
          { status: 200, headers: { "content-type": "text/plain" } },
        );
      }),
    );

    render(MarkPaidControl, { props: { ...base, open: true } });

    // The control renders the popover content directly when open=true on desktop
    // Fill Betrag with a partial amount
    const betragInput = screen.getByLabelText("Betrag (€)") as HTMLInputElement;
    await fireEvent.input(betragInput, { target: { value: "30,00" } });

    // Click Bezahlt
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));

    // fetch should have been called
    expect(fetch).toHaveBeenCalled();
    expect(capturedBody?.get("paidCents")).toBe("3000");
  });

  it("POSTs notes from the popover Notiz input", async () => {
    let capturedBody: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body as FormData;
        return new Response(
          JSON.stringify({ type: "success", status: 200, data: {} }),
          { status: 200, headers: { "content-type": "text/plain" } },
        );
      }),
    );

    render(MarkPaidControl, { props: { ...base, open: true } });

    const notizInput = screen.getByLabelText(
      "Notiz (optional)",
    ) as HTMLInputElement;
    await fireEvent.input(notizInput, { target: { value: "Überweisung" } });

    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));

    expect(fetch).toHaveBeenCalled();
    expect(capturedBody?.get("notes")).toBe("Überweisung");
  });

  it("POSTs notes as empty string when Notiz is blank", async () => {
    let capturedBody: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body as FormData;
        return new Response(
          JSON.stringify({ type: "success", status: 200, data: {} }),
          { status: 200, headers: { "content-type": "text/plain" } },
        );
      }),
    );

    render(MarkPaidControl, { props: { ...base, open: true } });

    // Leave Notiz empty, just click Bezahlt
    await fireEvent.click(screen.getByRole("button", { name: /Bezahlt/ }));

    expect(fetch).toHaveBeenCalled();
    // notes should be present (empty string when null)
    expect(capturedBody?.has("notes")).toBe(true);
  });
});
