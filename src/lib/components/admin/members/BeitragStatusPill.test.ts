/**
 * BeitragStatusPill — Package C (member-zahlung redesign).
 *
 * Aurora per-state pill: text-led + icon reinforcer; partial fraction;
 * rosa CTA affordance for open/overdue; emerald only for paid.
 *
 * Tests: state → correct classes + label; partial fraction rendering;
 *        compact prop; no hardcoded hex (enforced by grep in code-review).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import BeitragStatusPill from "./BeitragStatusPill.svelte";

afterEach(() => cleanup());

describe("BeitragStatusPill", () => {
  // ── paid (emerald only) ──────────────────────────────────────────────────

  it("paid: renders emerald pill with 'Bezahlt' label and ✓ icon affordance", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "paid",
        paidCents: 6000,
        betragCents: 6000,
        year: 2025,
      },
    });
    const pill = container.querySelector("[data-state='paid']")!;
    expect(pill).toBeTruthy();
    expect(pill.className).toMatch(/emerald/);
    expect(pill.textContent).toMatch(/Bezahlt/);
  });

  // ── open (rosa affordance) ───────────────────────────────────────────────

  it("open: renders 'Offen' with rosa/primary CTA styling", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "open",
        paidCents: 0,
        betragCents: 6000,
        year: 2025,
      },
    });
    const pill = container.querySelector("[data-state='open']")!;
    expect(pill).toBeTruthy();
    expect(pill.textContent).toMatch(/Offen/);
    // rosa = primary token; no emerald on open state
    expect(pill.className).not.toMatch(/emerald/);
  });

  // ── overdue (same rosa, 'Offen') ─────────────────────────────────────────

  it("overdue: renders 'Offen' (list projection) with severity-warn/primary accent", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "overdue",
        paidCents: 0,
        betragCents: 6000,
        year: 2024,
      },
    });
    const pill = container.querySelector("[data-state='overdue']")!;
    expect(pill).toBeTruthy();
    // overdue label is still "Offen" on the pill (detail shows overdue decoration separately)
    expect(pill.textContent).toMatch(/Offen/);
    expect(pill.className).not.toMatch(/emerald/);
  });

  // ── partial (amber fraction) ─────────────────────────────────────────────

  it("partial: renders the paid/betrag fraction and amber severity tokens", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "partial",
        paidCents: 3000,
        betragCents: 6000,
        year: 2025,
      },
    });
    const pill = container.querySelector("[data-state='partial']")!;
    expect(pill).toBeTruthy();
    // Fraction text: paid and betrag amounts visible
    expect(pill.textContent).toMatch(/30/); // 30,00 € or 30 €
    expect(pill.textContent).toMatch(/60/); // 60,00 € or 60 €
    // amber severity token on partial
    expect(pill.className).toMatch(/severity-warn|amber/);
    expect(pill.className).not.toMatch(/emerald/);
  });

  it("partial compact: still shows fraction in compact mode", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "partial",
        paidCents: 3000,
        betragCents: 6000,
        year: 2025,
        compact: true,
      },
    });
    const pill = container.querySelector("[data-state='partial']")!;
    expect(pill.textContent).toMatch(/30/);
    expect(pill.textContent).toMatch(/60/);
  });

  // ── exempt / permanently_exempt (slate / muted) ──────────────────────────

  it("exempt: renders 'Befreit' with slate/muted tones, no emerald", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "exempt",
        paidCents: 0,
        betragCents: 0,
        year: 2025,
        exemptReason: "Ehrenmitglied",
      },
    });
    const pill = container.querySelector("[data-state='exempt']")!;
    expect(pill).toBeTruthy();
    expect(pill.textContent).toMatch(/Befreit/);
    expect(pill.className).not.toMatch(/emerald/);
  });

  it("permanently_exempt: renders 'Befreit' with slate/muted tones", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "permanently_exempt",
        paidCents: 0,
        betragCents: 0,
        year: 2025,
      },
    });
    const pill = container.querySelector("[data-state='permanently_exempt']")!;
    expect(pill).toBeTruthy();
    expect(pill.textContent).toMatch(/Befreit/);
    expect(pill.className).not.toMatch(/emerald/);
  });

  // ── not_applicable states (muted dash) ───────────────────────────────────

  it("not_applicable_pre_join: renders muted '—' (pre-Eintritt)", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "not_applicable_pre_join",
        paidCents: 0,
        betragCents: 0,
        year: 2025,
      },
    });
    const pill = container.querySelector(
      "[data-state='not_applicable_pre_join']",
    )!;
    expect(pill).toBeTruthy();
    expect(pill.textContent).toMatch(/—/);
    expect(pill.className).not.toMatch(/emerald/);
  });

  it("not_applicable_post_austritt: renders muted '—' (ausgetreten)", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "not_applicable_post_austritt",
        paidCents: 0,
        betragCents: 0,
        year: 2025,
      },
    });
    const pill = container.querySelector(
      "[data-state='not_applicable_post_austritt']",
    )!;
    expect(pill).toBeTruthy();
    expect(pill.textContent).toMatch(/—/);
  });

  // ── min-h-11 interactive touch target ────────────────────────────────────

  it("pill has min-h-11 class for 44px touch target", () => {
    const { container } = render(BeitragStatusPill, {
      props: {
        state: "open",
        paidCents: 0,
        betragCents: 6000,
        year: 2025,
      },
    });
    const pill = container.querySelector("[data-state='open']")!;
    expect(pill.className).toMatch(/min-h-11/);
  });

  // ── data-testid for accessible selection ─────────────────────────────────

  it("pill has data-testid='beitrag-status-pill'", () => {
    render(BeitragStatusPill, {
      props: {
        state: "paid",
        paidCents: 6000,
        betragCents: 6000,
        year: 2025,
      },
    });
    expect(screen.getByTestId("beitrag-status-pill")).toBeTruthy();
  });
});
