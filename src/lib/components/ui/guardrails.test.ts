/**
 * Aurora — guardrail primitives (master §2.6, spec §9).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/svelte";
import FormFooterHarness from "./FormFooter.test.svelte";
import LockBanner from "./LockBanner.svelte";
import LockChip from "./LockChip.svelte";
import StatusChip from "./StatusChip.svelte";
import ConfirmDialog from "./ConfirmDialog.svelte";

afterEach(() => cleanup());

describe("FormFooter", () => {
  it("renders the live 'Fehlt noch' list when fields are missing", () => {
    render(FormFooterHarness, { props: { missing: ["Betrag", "Kategorie"] } });
    const list = screen.getByTestId("form-footer-missing");
    expect(list.textContent).toContain("Fehlt noch:");
    expect(list.textContent).toContain("Betrag");
    expect(list.textContent).toContain("Kategorie");
  });

  it("hides the list when nothing is missing", () => {
    render(FormFooterHarness, { props: { missing: [] } });
    expect(
      document.querySelector('[data-testid="form-footer-missing"]'),
    ).toBeNull();
  });

  it("pressing submit with gaps focuses the first data-missing field instead of submitting", async () => {
    render(FormFooterHarness, { props: { missing: ["Betrag"] } });
    await fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(document.activeElement).toBe(screen.getByTestId("gap-field"));
  });

  it("renders the non-field error slot with severity styling", () => {
    render(FormFooterHarness, {
      props: {
        missing: [],
        nonFieldError: {
          severity: "critical",
          message: "Netzwerkfehler — bitte erneut versuchen.",
        },
      },
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Netzwerkfehler");
    expect(alert.className).toContain("severity-critical");
  });
});

describe("LockBanner / LockChip (ADR-0006)", () => {
  it("LockBanner states the festschreibung consequence for the year", () => {
    render(LockBanner, { props: { year: 2024 } });
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain(
      "Buchungsjahr 2024 ist festgeschrieben",
    );
    expect(banner.textContent).toContain("nicht mehr geändert");
  });

  it("LockChip renders the compact festgeschrieben chip", () => {
    render(LockChip);
    expect(screen.getByText("Festgeschrieben")).toBeTruthy();
  });
});

describe("StatusChip", () => {
  it("maps known kinds to German labels", () => {
    const { unmount } = render(StatusChip, { props: { kind: "beleg-fehlt" } });
    expect(screen.getByText("Beleg fehlt")).toBeTruthy();
    unmount();
    render(StatusChip, { props: { kind: "ohne-kategorie" } });
    expect(screen.getByText("ohne Kategorie")).toBeTruthy();
  });

  it("renders unknown kinds verbatim", () => {
    render(StatusChip, { props: { kind: "Entwurf" } });
    expect(screen.getByText("Entwurf")).toBeTruthy();
  });
});

describe("ConfirmDialog", () => {
  it("states the consequence and confirms via callback", async () => {
    const onConfirm = vi.fn();
    render(ConfirmDialog, {
      props: {
        open: true,
        title: "Ausgabe löschen?",
        consequence: "Die Ausgabe wird endgültig gelöscht.",
        onConfirm,
      },
    });
    expect(
      screen.getByText("Die Ausgabe wird endgültig gelöscht."),
    ).toBeTruthy();
    await fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("typedConfirm gates the confirm button until the phrase matches", async () => {
    const onConfirm = vi.fn();
    render(ConfirmDialog, {
      props: {
        open: true,
        title: "Jahresabschluss 2025",
        consequence:
          "Das Buchungsjahr 2025 wird unwiderruflich festgeschrieben.",
        typedConfirm: "2025 festschreiben",
        onConfirm,
      },
    });
    const confirm = screen.getByTestId(
      "confirm-dialog-confirm",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const input = screen.getByTestId("confirm-dialog-input");
    await fireEvent.input(input, { target: { value: "2025 festschreiben" } });
    expect(confirm.disabled).toBe(false);
    await fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
