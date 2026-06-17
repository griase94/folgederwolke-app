/**
 * Aurora inbox redesign — InboxList (spec §2.1).
 *  - each row is a frozen TransactionRow (one <a>, data-testid="txn-row",
 *    type="ausgabe", href=/app/inbox/[ausId]); NO inline decision controls.
 *  - "Beleg fehlt" warn chip only when the row has no Beleg (Offen tab).
 *  - Geprüft/Abgelehnt rows carry a neutral status chip, no warn chip.
 *  - ↑/↓/Home/End move focus across the txn-row anchors.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import InboxList from "./InboxList.svelte";
import type { InboxSubmissionView } from "$lib/domain/inbox.js";

afterEach(() => cleanup());

function row(over: Partial<InboxSubmissionView>): InboxSubmissionView {
  return {
    id: "id-" + (over.ausId ?? "x"),
    ausId: "AUS-2026-001",
    bezeichnung: "Bahnticket",
    betragCents: 4250,
    currency: "EUR",
    bezahltVonKind: "member",
    bezahltVonDisplay: "Max Mustermann",
    bezahltVonMemberId: null,
    bezahltVonMemberDisplay: "Max Mustermann",
    rechnungsdatum: null,
    submittedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    reviewedAt: null,
    belegDriveFileId: null,
    belegFileId: "file-1",
    belegOriginalName: "beleg.pdf",
    projectId: null,
    projectName: null,
    wofuer: null,
    kommentar: null,
    decided: "no",
    decision: null,
    ...over,
  };
}

describe("InboxList — Aurora", () => {
  it("renders each submission as ONE txn-row link to the review route, no decision controls", () => {
    render(InboxList, {
      props: {
        submissions: [row({ ausId: "AUS-2026-001" })],
        activeStatus: "Offen",
      },
    });
    const rows = screen.getAllByTestId("txn-row");
    expect(rows.length).toBe(1);
    expect(rows[0]!.tagName).toBe("A");
    expect(rows[0]!.getAttribute("href")).toBe("/app/inbox/AUS-2026-001");
    expect(rows[0]!.getAttribute("data-kind")).toBe("ausgabe");
    // No approve/reject affordance anywhere in the list (topology guardrail).
    expect(screen.queryByTestId("inbox-card-approve-start")).toBeNull();
    expect(screen.queryByTestId("inbox-card-kebab")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Genehmigen|Freigeben|Ablehnen/ }),
    ).toBeNull();
  });

  it("shows a 'Beleg fehlt' warn chip only when the row has no Beleg (Offen)", () => {
    render(InboxList, {
      props: {
        submissions: [
          row({
            ausId: "AUS-2026-002",
            belegFileId: null,
            belegDriveFileId: null,
          }),
        ],
        activeStatus: "Offen",
      },
    });
    const chip = screen.getByTestId("row-chip");
    expect(chip.textContent).toContain("Beleg fehlt");
    expect(chip.className).toContain("text-severity-warn-text");
  });

  it("Geprüft rows carry a neutral 'Genehmigt' chip and no warn chip", () => {
    render(InboxList, {
      props: {
        submissions: [
          row({ ausId: "AUS-2026-003", decided: "yes", decision: "approved" }),
        ],
        activeStatus: "Geprüft",
      },
    });
    const chip = screen.getByTestId("row-chip");
    expect(chip.textContent).toContain("Genehmigt");
    expect(chip.className).toContain("text-ink-500");
  });

  it("ArrowDown moves focus to the next row", async () => {
    render(InboxList, {
      props: {
        submissions: [
          row({ ausId: "AUS-2026-010", id: "a" }),
          row({ ausId: "AUS-2026-011", id: "b" }),
        ],
        activeStatus: "Offen",
      },
    });
    const rows = screen.getAllByTestId("txn-row");
    rows[0]!.focus();
    expect(document.activeElement).toBe(rows[0]);
    await fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
  });
});
