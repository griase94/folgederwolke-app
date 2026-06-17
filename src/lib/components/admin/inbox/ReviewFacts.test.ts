/**
 * Aurora inbox redesign — ReviewFacts (spec §2.2 right column).
 *  - mono AUS-id eyebrow + "Neu" / "Schon gesehen" chip.
 *  - amount is UNSIGNED solid ink-900 tabular (the claim amount, not a ledger line).
 *  - Extern → masked IBAN (mono) + E-Mail; Mitglied → link + amber ausgetreten note.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import ReviewFacts from "./ReviewFacts.svelte";
import type { InboxSubmissionDetailView } from "$lib/domain/inbox.js";

afterEach(() => cleanup());

function detail(
  over: Partial<InboxSubmissionDetailView>,
): InboxSubmissionDetailView {
  return {
    id: "id-1",
    ausId: "AUS-2026-007",
    bezeichnung: "Bahnticket Workshop",
    betragCents: 8450,
    currency: "EUR",
    bezahltVonKind: "member",
    bezahltVonDisplay: "Max Mustermann",
    bezahltVonMemberId: "m-1",
    bezahltVonMemberDisplay: "Max Mustermann",
    rechnungsdatum: "2026-05-12",
    submittedAt: "2026-05-14T09:00:00.000Z",
    reviewedAt: null,
    belegDriveFileId: null,
    belegFileId: "f-1",
    belegOriginalName: "beleg.pdf",
    projectId: null,
    projectName: null,
    wofuer: "Workshop-Anreise",
    kommentar: null,
    decided: "no",
    decision: null,
    externName: null,
    externIbanMasked: null,
    externEmail: null,
    consentTextVersion: "v1",
    consentGivenAt: "2026-05-14T09:00:00.000Z",
    submitterIpPrefix: null,
    belegViewLink: null,
    belegMimeType: "application/pdf",
    belegOriginalFilename: "beleg.pdf",
    memberContext: {
      id: "m-1",
      vorname: "Max",
      nachname: "Mustermann",
      email: "max@example.org",
      austrittsDatum: null,
    },
    ...over,
  };
}

describe("ReviewFacts", () => {
  it("renders the mono id eyebrow + 'Neu' chip when unreviewed", () => {
    render(ReviewFacts, {
      props: { submission: detail({ reviewedAt: null }) },
    });
    expect(screen.getByText("AUS-2026-007")).toBeTruthy();
    expect(screen.getByText("Neu")).toBeTruthy();
  });

  it("renders 'Schon gesehen' when reviewed", () => {
    render(ReviewFacts, {
      props: { submission: detail({ reviewedAt: "2026-05-15T08:00:00.000Z" }) },
    });
    expect(screen.getByText("Schon gesehen")).toBeTruthy();
  });

  it("renders the amount UNSIGNED in ink-900 tabular (no minus, no plus)", () => {
    render(ReviewFacts, {
      props: { submission: detail({ betragCents: 8450 }) },
    });
    const amount = screen.getByTestId("review-amount");
    expect(amount.textContent).toMatch(/84,50/);
    expect(amount.textContent).not.toMatch(/[-−+]/);
    expect(amount.className).toContain("text-ink-900");
    expect(amount.className).toContain("tabular-nums");
  });

  it("Extern: shows masked IBAN (mono) + E-Mail + Extern chip", () => {
    render(ReviewFacts, {
      props: {
        submission: detail({
          bezahltVonKind: "extern",
          bezahltVonDisplay: "ACME GmbH",
          externName: "ACME GmbH",
          externIbanMasked: "DE12 … 3000",
          externEmail: "buchhaltung@acme.example",
          memberContext: null,
          bezahltVonMemberId: null,
          bezahltVonMemberDisplay: null,
        }),
      },
    });
    expect(screen.getByText("Extern")).toBeTruthy();
    const iban = screen.getByText("DE12 … 3000");
    expect(iban.className).toContain("font-mono");
    expect(screen.getByText("buchhaltung@acme.example")).toBeTruthy();
  });

  it("Mitglied who left: shows the amber ausgetreten note", () => {
    render(ReviewFacts, {
      props: {
        submission: detail({
          memberContext: {
            id: "m-1",
            vorname: "Max",
            nachname: "Mustermann",
            email: null,
            austrittsDatum: "2026-03-31",
          },
        }),
      },
    });
    const note = screen.getByText(/ausgetreten/);
    expect(note.className).toContain("text-severity-warn-text");
  });
});
