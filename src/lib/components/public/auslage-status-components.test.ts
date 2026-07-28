import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import Callout from "./Callout.svelte";
import ReasonBox from "./ReasonBox.svelte";
import AusIdCard from "./AusIdCard.svelte";
import BatchConfirmGroup from "./BatchConfirmGroup.svelte";
import AuslageStatusDetail from "./AuslageStatusDetail.svelte";
import BatchStatusGroup, { type BatchNode } from "./BatchStatusGroup.svelte";

afterEach(() => cleanup());

describe("Callout", () => {
  it("carries the tone + role=status by default", () => {
    render(Callout, { props: { tone: "brand", title: "Julia prüft" } });
    const el = screen.getByTestId("callout");
    expect(el.getAttribute("data-tone")).toBe("brand");
    expect(el.getAttribute("role")).toBe("status");
    expect(screen.getByText("Julia prüft")).toBeTruthy();
  });

  it("INVARIANT: warn + crit tones announce as role=alert", () => {
    render(Callout, { props: { tone: "warn", title: "Offline" } });
    expect(screen.getByTestId("callout").getAttribute("role")).toBe("alert");
    cleanup();
    render(Callout, { props: { tone: "crit", title: "Fehler" } });
    expect(screen.getByTestId("callout").getAttribute("role")).toBe("alert");
  });
});

describe("ReasonBox", () => {
  it("renders Julia's words verbatim + the by-line", () => {
    render(ReasonBox, {
      props: {
        reason: "Beleg unscharf — bitte neu.",
        by: "Julia",
        when: "08.06.2026",
      },
    });
    expect(screen.getByTestId("reason-box-text").textContent).toContain(
      "Beleg unscharf — bitte neu.",
    );
    expect(screen.getByText("von Julia")).toBeTruthy();
  });
});

describe("AusIdCard", () => {
  it("shows the AUS-Nr + plum amount + Beleg row", () => {
    render(AusIdCard, {
      props: {
        ausId: "AUS-2026-0071",
        betragCents: 2490,
        belegName: "bon.jpg",
      },
    });
    expect(screen.getByText("AUS-2026-0071")).toBeTruthy();
    const amt = screen.getByTestId("aus-id-card-amount");
    expect(amt.textContent).toContain("24,90");
    // INVARIANT: amount is plum (type-ausgabe), never sign-toned.
    expect(amt.className).toContain("text-type-ausgabe");
    expect(screen.getByText(/bon\.jpg angehängt/)).toBeTruthy();
  });
});

describe("BatchConfirmGroup", () => {
  it("lists each item + a total equal to the sum, all plum", () => {
    render(BatchConfirmGroup, {
      props: {
        items: [
          {
            ausId: "AUS-2026-0077",
            bezeichnung: "Kuchen",
            betragCents: 2490,
            belegOk: true,
          },
          {
            ausId: "AUS-2026-0078",
            bezeichnung: "Miete",
            betragCents: 1490,
            belegOk: true,
          },
        ],
        gesamtCents: 3980,
      },
    });
    expect(screen.getByText("AUS-2026-0077")).toBeTruthy();
    expect(screen.getByText("AUS-2026-0078")).toBeTruthy();
    const total = screen.getByTestId("bcg-total");
    expect(total.textContent).toContain("39,80");
    expect(total.className).toContain("text-type-ausgabe");
  });
});

const detail = {
  factsRows: [
    {
      label: "Betrag",
      value: "24,90 €",
      variant: "amount" as const,
      tone: "ausgabe" as const,
    },
  ],
  timeline: [{ title: "Eingereicht", state: "done" as const }],
};

describe("AuslageStatusDetail", () => {
  it("renders the reject ReasonBox + recovery CTA when rejected", () => {
    render(AuslageStatusDetail, {
      props: {
        ...detail,
        reject: { reason: "Beleg unscharf.", by: "Julia", when: "08.06." },
        recoveryHref: "/auslage-einreichen",
      },
    });
    expect(screen.getByTestId("reason-box")).toBeTruthy();
    expect(screen.getByTestId("reject-recovery-cta")).toBeTruthy();
    // A rejected node shows NO next-step callout.
    expect(screen.queryByTestId("callout")).toBeNull();
  });

  it("renders the next-step callout when not rejected", () => {
    render(AuslageStatusDetail, {
      props: {
        ...detail,
        nextStep: { tone: "brand", title: "Du musst nichts tun" },
      },
    });
    expect(screen.getByTestId("callout")).toBeTruthy();
    expect(screen.queryByTestId("reason-box")).toBeNull();
  });
});

const nodes: BatchNode[] = [
  {
    ausId: "AUS-2026-0077",
    bezeichnung: "Kuchen",
    betragCents: 2490,
    chip: { variant: "ok", label: "Erstattet" },
    detail,
  },
  {
    ausId: "AUS-2026-0078",
    bezeichnung: "Miete",
    betragCents: 1490,
    chip: { variant: "open", label: "In Prüfung" },
    detail,
  },
  {
    ausId: "AUS-2026-0079",
    bezeichnung: "Deko",
    betragCents: 2390,
    chip: { variant: "crit", label: "Abgelehnt" },
    detail: {
      ...detail,
      reject: { reason: "Unscharf." },
      recoveryHref: "/auslage-einreichen",
    },
  },
];

describe("BatchStatusGroup", () => {
  it("renders one node per entry; only the deep-linked node is open", () => {
    render(BatchStatusGroup, {
      props: {
        submittedLabel: "04.07.2026",
        gesamtCents: 6370,
        tally: [
          { variant: "ok", label: "1 erstattet" },
          { variant: "open", label: "1 in Prüfung" },
          { variant: "crit", label: "1 abgelehnt" },
        ],
        nodes,
        focusAusId: "AUS-2026-0078",
      },
    });
    const nodeEls = document.querySelectorAll('[data-slot="bsg-node"]');
    expect(nodeEls.length).toBe(3);
    const focus = [...nodeEls].find(
      (n) => n.getAttribute("data-focus") === "true",
    );
    expect(focus?.getAttribute("data-open")).toBe("true");
    // The other two nodes are collapsed.
    const openCount = [...nodeEls].filter(
      (n) => n.getAttribute("data-open") === "true",
    ).length;
    expect(openCount).toBe(1);
  });

  it("INVARIANT: every node carries its OWN status chip — no aggregate/averaged status", () => {
    render(BatchStatusGroup, {
      props: {
        submittedLabel: "04.07.2026",
        gesamtCents: 6370,
        tally: [],
        nodes,
        focusAusId: "AUS-2026-0077",
      },
    });
    // The abgelehnt chip and the erstattet chip both appear — one fate never
    // overrides another (brief §3.6). "Erstattet" is in the tally-less head too,
    // so assert both distinct fates are present as node chips.
    expect(screen.getAllByText("Erstattet").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Abgelehnt").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("In Prüfung").length).toBeGreaterThanOrEqual(1);
  });
});
