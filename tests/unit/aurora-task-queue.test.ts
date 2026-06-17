/**
 * @vitest-environment node
 * @phase-aurora-slice4
 *
 * Exhaustive tests for buildTaskQueue (spec §7 predicate table): every
 * predicate on/off, exact German wording sing./pl., conditional "weitere",
 * dedupe rule, rank-0-takes-filled-CTA rule (via railKind), deterministic
 * sort tier → €-sum desc → alphabetical, Berlin-year anchoring, and the
 * NEVER-literal Freigrenze rule.
 */
import { describe, it, expect } from "vitest";
import {
  buildTaskQueue,
  compareTasks,
  type TaskQueueInput,
} from "$lib/domain/task-queue.js";

// 2026-03-15 12:00 UTC → Berlin year 2026, month March (normal close window).
const TODAY = new Date("2026-03-15T12:00:00Z");

function baseInput(over: Partial<TaskQueueInput> = {}): TaskQueueInput {
  return {
    wgb: { status: "ok", einnahmenCents: 0, freigrenzeCents: 5_000_000 },
    openAuslagenCount: 0,
    approvedNotErstattetCount: 0,
    approvedNotErstattetSumCents: 0,
    overdueCount: 0,
    openMemberCount: 0,
    priorYearsUnpaidCount: 0,
    festgeschriebenBis: 2025, // = 2026 − 1 → Jahresabschluss predicate OFF
    ...over,
  };
}

describe("buildTaskQueue — predicates & wording", () => {
  it("all predicates off → empty list", () => {
    expect(buildTaskQueue(baseInput(), TODAY)).toEqual([]);
  });

  it("Belegprüfung: plural and singular wording, CTA Prüfen → /app/inbox", () => {
    let [t] = buildTaskQueue(baseInput({ openAuslagenCount: 3 }), TODAY);
    expect(t!.title).toBe("3 Auslagen warten auf Prüfung");
    expect(t!.ctaLabel).toBe("Prüfen");
    expect(t!.href).toBe("/app/inbox");
    [t] = buildTaskQueue(baseInput({ openAuslagenCount: 1 }), TODAY);
    expect(t!.title).toBe("1 Auslage wartet auf Prüfung");
  });

  it("Erstattungen: wording + sum + CTA Zur Überweisungsliste", () => {
    const [t] = buildTaskQueue(
      baseInput({
        approvedNotErstattetCount: 2,
        approvedNotErstattetSumCents: 12345,
      }),
      TODAY,
    );
    expect(t!.title).toBe("2 Erstattungen freigegeben");
    expect(t!.amountCents).toBe(12345);
    expect(t!.ctaLabel).toBe("Zur Überweisungsliste");
    expect(t!.href).toBe("/app/ausgaben/ueberweisungen");
    const [s] = buildTaskQueue(
      baseInput({
        approvedNotErstattetCount: 1,
        approvedNotErstattetSumCents: 500,
      }),
      TODAY,
    );
    expect(s!.title).toBe("1 Erstattung freigegeben");
  });

  it("Beiträge überfällig: count-only wording, filter=ueberfaellig", () => {
    const [t] = buildTaskQueue(
      baseInput({ overdueCount: 4, openMemberCount: 4 }),
      TODAY,
    );
    expect(t!.title).toBe("4 Beiträge überfällig");
    expect(t!.amountCents).toBeUndefined();
    expect(t!.href).toBe("/app/mitglieder?view=matrix&filter=ueberfaellig");
    const [s] = buildTaskQueue(
      baseInput({ overdueCount: 1, openMemberCount: 1 }),
      TODAY,
    );
    expect(s!.title).toBe("1 Beitrag überfällig");
  });

  it("Beiträge offen DEDUPE: 'weitere' only when the überfällig row renders above", () => {
    // overdue 3, open 5 → überfällig row + "2 weitere Beiträge offen"
    let tasks = buildTaskQueue(
      baseInput({ overdueCount: 3, openMemberCount: 5 }),
      TODAY,
    );
    expect(tasks.map((t) => t.id)).toEqual([
      "beitraege-ueberfaellig",
      "beitraege-offen",
    ]);
    expect(tasks[1]!.title).toBe("2 weitere Beiträge offen");
    // singular weitere
    tasks = buildTaskQueue(
      baseInput({ overdueCount: 3, openMemberCount: 4 }),
      TODAY,
    );
    expect(tasks[1]!.title).toBe("1 weiterer Beitrag offen");
    // no überfällig → plain wording
    tasks = buildTaskQueue(
      baseInput({ overdueCount: 0, openMemberCount: 2 }),
      TODAY,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.title).toBe("2 Beiträge offen");
    tasks = buildTaskQueue(
      baseInput({ overdueCount: 0, openMemberCount: 1 }),
      TODAY,
    );
    expect(tasks[0]!.title).toBe("1 Beitrag offen");
    // fully deduped: open == overdue → no offen row
    tasks = buildTaskQueue(
      baseInput({ overdueCount: 3, openMemberCount: 3 }),
      TODAY,
    );
    expect(tasks.map((t) => t.id)).toEqual(["beitraege-ueberfaellig"]);
  });

  it("Vorjahres-Beiträge: N counts YEARS, low rank", () => {
    const [t] = buildTaskQueue(baseInput({ priorYearsUnpaidCount: 2 }), TODAY);
    expect(t!.title).toBe("Offene Beiträge aus 2 Vorjahren");
    const [s] = buildTaskQueue(baseInput({ priorYearsUnpaidCount: 1 }), TODAY);
    expect(s!.title).toBe("Offene Beiträge aus 1 Vorjahr");
    expect(s!.href).toBe("/app/mitglieder?view=matrix&filter=offen");
  });
});

describe("buildTaskQueue — WGB (never a literal Freigrenze)", () => {
  it("ueberschritten: pinned rank 0, critical, formats BOTH amounts from input", () => {
    const tasks = buildTaskQueue(
      baseInput({
        wgb: {
          status: "ueberschritten",
          einnahmenCents: 4_600_000,
          freigrenzeCents: 4_500_000,
        },
        openAuslagenCount: 2,
      }),
      TODAY,
    );
    expect(tasks[0]!.id).toBe("wgb-ueberschritten");
    expect(tasks[0]!.severity).toBe("critical");
    expect(tasks[0]!.railKind).toBe("critical");
    // freigrenzeCents = 45.000 € here — a hardcoded 50.000 would fail:
    expect(tasks[0]!.title).toContain("46.000,00");
    expect(tasks[0]!.title).toContain("45.000,00");
    expect(tasks[0]!.title).toContain("Freigrenze § 64 AO überschritten");
    expect(tasks[0]!.subline).toBe("Sphären-Zuordnung der Buchungen prüfen");
    expect(tasks[0]!.ctaLabel).toBe("Buchungen prüfen");
    expect(tasks[0]!.href).toBe("/app/einnahmen?sphaere=wirtschaftlich");
  });

  it("rank-0-takes-filled-CTA rule: with a pinned critical task NO row gets railKind rank1", () => {
    const tasks = buildTaskQueue(
      baseInput({
        wgb: {
          status: "ueberschritten",
          einnahmenCents: 5_100_000,
          freigrenzeCents: 5_000_000,
        },
        openAuslagenCount: 2,
        approvedNotErstattetCount: 1,
        approvedNotErstattetSumCents: 100,
      }),
      TODAY,
    );
    expect(tasks[0]!.railKind).toBe("critical");
    expect(tasks.filter((t) => t.railKind === "rank1")).toHaveLength(0);
  });

  it("warn tiers (erhoeht + kritisch): percentage wording, amber, NOT pinned over the pipeline order", () => {
    for (const status of ["erhoeht", "kritisch"] as const) {
      const tasks = buildTaskQueue(
        baseInput({
          wgb: {
            status,
            einnahmenCents: 4_100_000,
            freigrenzeCents: 5_000_000,
          },
        }),
        TODAY,
      );
      expect(tasks[0]!.id).toBe("wgb-warn");
      expect(tasks[0]!.severity).toBe("warn");
      expect(tasks[0]!.railKind).toBe("warn");
      // formatMoney emits U+00A0 (NBSP) before each €; match with [\s ]€ at
      // both amounts (escaped dots) — the rest of the title stays exact.
      expect(tasks[0]!.title).toMatch(
        /^WGB zu 82 % ausgeschöpft — 41\.000,00[\s ]€ von 50\.000,00[\s ]€$/,
      );
    }
  });

  it("ok status → no WGB task", () => {
    const tasks = buildTaskQueue(
      baseInput({
        wgb: {
          status: "ok",
          einnahmenCents: 1_000_000,
          freigrenzeCents: 5_000_000,
        },
      }),
      TODAY,
    );
    expect(tasks).toEqual([]);
  });
});

describe("buildTaskQueue — Jahresabschluss (Berlin dates)", () => {
  const open = { festgeschriebenBis: 2023 }; // 2023 < 2026−1 → predicate ON

  it("January: 'empfohlen ab Februar' — must NOT claim a block, no severity", () => {
    const jan = new Date("2026-01-10T12:00:00Z");
    const [t] = buildTaskQueue(baseInput(open), jan);
    expect(t!.title).toBe("Jahresabschluss 2025 — empfohlen ab Februar");
    expect(t!.severity).toBeUndefined();
    expect(t!.ctaLabel).toBe("Zum Jahresabschluss");
    expect(t!.href).toBe("/app/jahresabschluss");
  });

  it("Feb–Jun: normal wording", () => {
    const [t] = buildTaskQueue(baseInput(open), TODAY); // March
    expect(t!.title).toBe("Jahresabschluss 2025 steht an");
    expect(t!.severity).toBeUndefined();
  });

  it("Jul+: escalated wording with warn severity", () => {
    const aug = new Date("2026-08-10T12:00:00Z");
    const [t] = buildTaskQueue(baseInput(open), aug);
    expect(t!.title).toBe("Jahresabschluss 2025 ist überfällig");
    expect(t!.severity).toBe("warn");
  });

  it("predicate: festgeschriebenBis = year−1 → off; null → on; anchored to berlinYear(today)", () => {
    expect(
      buildTaskQueue(baseInput({ festgeschriebenBis: 2025 }), TODAY),
    ).toEqual([]);
    const [t] = buildTaskQueue(baseInput({ festgeschriebenBis: null }), TODAY);
    expect(t!.id).toBe("jahresabschluss");
    // Berlin new-year edge: 2026-12-31 23:30 UTC is already 2027 in Berlin
    const sylvester = new Date("2026-12-31T23:30:00Z");
    const [u] = buildTaskQueue(
      baseInput({ festgeschriebenBis: 2023 }),
      sylvester,
    );
    expect(u!.title).toBe("Jahresabschluss 2026 — empfohlen ab Februar");
  });
});

describe("buildTaskQueue — ordering & rails", () => {
  it("full house sorts by tier: WGB-warn → Belegprüfung → Erstattungen → überfällig → offen → Jahresabschluss → Vorjahre", () => {
    const tasks = buildTaskQueue(
      baseInput({
        wgb: {
          status: "erhoeht",
          einnahmenCents: 4_100_000,
          freigrenzeCents: 5_000_000,
        },
        openAuslagenCount: 2,
        approvedNotErstattetCount: 1,
        approvedNotErstattetSumCents: 4200,
        overdueCount: 1,
        openMemberCount: 3,
        priorYearsUnpaidCount: 1,
        festgeschriebenBis: 2023,
      }),
      TODAY,
    );
    expect(tasks.map((t) => t.id)).toEqual([
      "wgb-warn",
      "belegpruefung",
      "erstattungen",
      "beitraege-ueberfaellig",
      "beitraege-offen",
      "jahresabschluss",
      "vorjahres-beitraege",
    ]);
    // rank-1 spine: first row is warn → severity rail wins, NO rank1 spine
    expect(tasks[0]!.railKind).toBe("warn");
    expect(tasks.filter((t) => t.railKind === "rank1")).toHaveLength(0);
  });

  it("first row without severity gets the rank1 rail; all others default/severity", () => {
    const tasks = buildTaskQueue(
      baseInput({
        openAuslagenCount: 1,
        approvedNotErstattetCount: 1,
        approvedNotErstattetSumCents: 1,
      }),
      TODAY,
    );
    expect(tasks[0]!.id).toBe("belegpruefung");
    expect(tasks[0]!.railKind).toBe("rank1");
    expect(tasks[1]!.railKind).toBe("default");
  });

  it("compareTasks: tier asc, then €-sum desc, then de-alphabetical", () => {
    expect(
      compareTasks({ tier: 1, title: "b" }, { tier: 2, title: "a" }),
    ).toBeLessThan(0);
    expect(
      compareTasks(
        { tier: 1, amountCents: 100, title: "b" },
        { tier: 1, amountCents: 900, title: "a" },
      ),
    ).toBeGreaterThan(0);
    expect(
      compareTasks({ tier: 1, title: "Äpfel" }, { tier: 1, title: "Birnen" }),
    ).toBeLessThan(0);
  });
});
