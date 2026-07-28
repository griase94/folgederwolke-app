import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import AuslageBlock from "./AuslageBlock.svelte";
import BatchReviewList from "./BatchReviewList.svelte";

afterEach(() => cleanup());

const body = createRawSnippet(() => ({
  render: () => `<div data-testid="block-fields">Felder</div>`,
}));

describe("AuslageBlock", () => {
  it("collapsed + valid shows the summary and the green check, hides the body", () => {
    render(AuslageBlock, {
      props: {
        index: 1,
        open: false,
        valid: true,
        summary: {
          title: "Kuchen",
          amountLabel: "24,90 €",
          belegOk: true,
          dateLabel: "04.07.2026",
        },
        body,
      },
    });
    expect(screen.getByText("Kuchen")).toBeTruthy();
    expect(screen.getByText("24,90 €")).toBeTruthy();
    // Body is not rendered while collapsed.
    expect(screen.queryByTestId("block-fields")).toBeNull();
    const block = screen.getByTestId("auslage-block");
    expect(block.getAttribute("data-valid")).toBe("true");
    expect(block.getAttribute("data-open")).toBe("false");
  });

  it("open shows the body + aria-expanded=true on the header", () => {
    render(AuslageBlock, {
      props: { index: 2, open: true, valid: false, body },
    });
    expect(screen.getByTestId("block-fields")).toBeTruthy();
    const header = screen.getByRole("button", { expanded: true });
    expect(header).toBeTruthy();
  });

  it("fires onRemove from the remove button", async () => {
    const onRemove = vi.fn();
    render(AuslageBlock, {
      props: {
        index: 1,
        open: true,
        valid: false,
        removable: true,
        onRemove,
        body,
      },
    });
    screen.getByLabelText("Auslage 1 entfernen").click();
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe("BatchReviewList", () => {
  it("marks an incomplete row 'unvollständig' with no amount and shows the total", () => {
    render(BatchReviewList, {
      props: {
        items: [
          {
            clientKey: "a1",
            title: "Kuchen",
            dateLabel: "04.07.2026",
            betragCents: 2490,
            belegOk: true,
          },
          {
            clientKey: "a2",
            title: "Auslage 2",
            betragCents: null,
            incomplete: true,
          },
        ],
        gesamtCents: 2490,
      },
    });
    expect(screen.getByText("unvollständig")).toBeTruthy();
    const incompleteRow = screen
      .getByText("unvollständig")
      .closest('[data-slot="brl-row"]');
    expect(incompleteRow?.getAttribute("data-incomplete")).toBe("true");
    // total (plum) reflects only the complete row
    const total = screen.getByTestId("brl-total");
    expect(total.textContent).toContain("24,90");
    expect(total.className).toContain("text-type-ausgabe");
  });
});
