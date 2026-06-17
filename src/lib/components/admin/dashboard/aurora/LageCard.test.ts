/**
 * @phase-aurora-slice4
 * Lage card (spec §7): hairline sections in order Beiträge → Sphären → WGB.
 * WGB consumes wgb.status + wgb.freigrenzeCents — NEVER literal euro amounts.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import LageCard from "./LageCard.svelte";

afterEach(() => cleanup());

const base = {
  beitraege: {
    year: 2026,
    paidMemberCount: 4,
    openMemberCount: 3,
    overdueCount: 1,
    paidCents: 28000,
    offenCents: 12000,
  },
  dimmed: false,
  sphaeren: [
    { sphere: "ideeller" as const, saldoCents: 50000 },
    { sphere: "vermoegen" as const, saldoCents: 0 },
    { sphere: "zweckbetrieb" as const, saldoCents: -1500 },
    { sphere: "wirtschaftlich" as const, saldoCents: 200 },
  ],
  wgb: {
    status: "ok" as const,
    einnahmenCents: 200,
    freigrenzeCents: 5_000_000,
  },
};

describe("LageCard", () => {
  it("renders sections in spec order: Beiträge → Sphären → WGB", () => {
    const { container } = render(LageCard, { props: base });
    const ids = Array.from(
      container.querySelectorAll("[data-testid^='lage-']"),
    ).map((el) => el.getAttribute("data-testid"));
    expect(ids).toEqual(["lage-beitraege", "lage-sphaeren", "lage-wgb"]);
  });

  it("Beiträge section: N/M bezahlt + both sums", () => {
    render(LageCard, { props: base });
    expect(screen.getByText("4/7 bezahlt")).toBeTruthy();
    const sums = screen.getByTestId("lage-beitraege-sums");
    expect(sums.textContent).toContain("280,00");
    expect(sums.textContent).toContain("eingegangen");
    expect(sums.textContent).toContain("120,00");
    expect(sums.textContent).toContain("offen");
  });

  it("dimmed mode (selected year ≠ Berlin year) dims the Beiträge block and shows the Heute label", () => {
    render(LageCard, { props: { ...base, dimmed: true } });
    expect(screen.getByTestId("lage-beitraege").className).toContain(
      "opacity-60",
    );
    expect(screen.getByTestId("lage-heute-label")).toBeTruthy();
  });

  it("negative Sphären saldo gets the severity text token, positive gets ink", () => {
    render(LageCard, { props: base });
    const neg = screen.getByTestId("sphaere-saldo-zweckbetrieb");
    expect(neg.className).toContain("text-severity-critical-text");
    const pos = screen.getByTestId("sphaere-saldo-ideeller");
    expect(pos.className).toContain("text-ink-700");
  });

  it("WGB meter renders the Freigrenze FROM PROPS (no literal) and hides at 0", () => {
    const { unmount } = render(LageCard, {
      props: {
        ...base,
        wgb: { status: "ok", einnahmenCents: 200, freigrenzeCents: 4_500_000 },
      },
    });
    // freigrenzeCents prop drives the label — a stale hardcoded 50.000 would fail here
    expect(screen.getByTestId("lage-wgb").textContent).toContain("45.000,00");
    unmount();
    render(LageCard, {
      props: {
        ...base,
        wgb: { status: "ok", einnahmenCents: 0, freigrenzeCents: 5_000_000 },
      },
    });
    expect(screen.queryByTestId("lage-wgb")).toBeNull();
  });

  it("WGB fill is semantic per status — never re-derived from cents", () => {
    const { unmount } = render(LageCard, {
      props: {
        ...base,
        wgb: {
          status: "ueberschritten",
          einnahmenCents: 5_100_000,
          freigrenzeCents: 5_000_000,
        },
      },
    });
    expect(screen.getByTestId("lage-wgb-fill").className).toContain(
      "bg-severity-critical",
    );
    unmount();
    render(LageCard, {
      props: {
        ...base,
        wgb: {
          status: "erhoeht",
          einnahmenCents: 4_100_000,
          freigrenzeCents: 5_000_000,
        },
      },
    });
    expect(screen.getByTestId("lage-wgb-fill").className).toContain(
      "bg-severity-warn",
    );
  });
});
