/**
 * Aurora dashboard task queue — pure predicate/sort logic (spec §7 table).
 *
 * No DB access: the loader hands in already-loaded counts; this module turns
 * them into an ordered, fully-worded German task list.
 *
 * Anchoring: TODAY in Europe/Berlin (berlinYear) — NOT the year switcher.
 * Money: integer cents (ADR-0003), formatted via the shared de-DE formatter.
 * The § 64 AO Freigrenze is ALWAYS formatted from wgb.freigrenzeCents —
 * NEVER a literal (statutory value changes; a stale figure in a tax warning
 * is the worst bug this app can have — spec §7).
 */
import { berlinYear } from "$lib/domain/year.js";
import { formatMoney } from "$lib/components/ui/money/money.svelte";

export type TaskSeverity = "warn" | "critical";
export type TaskRailKind = "rank1" | "warn" | "critical" | "default";

export type TaskId =
  | "wgb-ueberschritten"
  | "wgb-warn"
  | "belegpruefung"
  | "erstattungen"
  | "beitraege-ueberfaellig"
  | "beitraege-offen"
  | "jahresabschluss"
  | "vorjahres-beitraege";

export interface QueueTask {
  id: TaskId;
  /** Sort tier — lower = higher priority. Fixed per task kind. */
  tier: number;
  severity?: TaskSeverity;
  title: string;
  subline?: string;
  amountCents?: number;
  ctaLabel: string;
  href: string;
  /**
   * Rail + CTA emphasis in one value (spec §7 CTA hierarchy):
   * 'critical' → red rail AND the page's ONLY filled CTA (red).
   * 'rank1'    → gradient spine AND the only filled CTA (primary-strong);
   *              assigned ONLY when no critical task is pinned at rank 0
   *              (visual priority follows actual priority — the demote rule).
   * 'warn' / 'default' → text-link CTA.
   */
  railKind: TaskRailKind;
}

export interface TaskQueueInput {
  wgb: {
    status: "ok" | "erhoeht" | "kritisch" | "ueberschritten";
    einnahmenCents: number;
    freigrenzeCents: number;
  };
  openAuslagenCount: number;
  approvedNotErstattetCount: number;
  approvedNotErstattetSumCents: number;
  /** From beitragsuebersicht (already berlinYear-anchored in the loader). */
  overdueCount: number;
  openMemberCount: number;
  priorYearsUnpaidCount: number;
  festgeschriebenBis: number | null;
}

function berlinMonth(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      month: "numeric",
    }).format(d),
    10,
  );
}

type Candidate = Omit<QueueTask, "railKind">;

/** Deterministic comparator (spec §7): tier → €-sum desc → alphabetical (de). */
export function compareTasks(
  a: { tier: number; amountCents?: number; title: string },
  b: { tier: number; amountCents?: number; title: string },
): number {
  return (
    a.tier - b.tier ||
    (b.amountCents ?? 0) - (a.amountCents ?? 0) ||
    a.title.localeCompare(b.title, "de")
  );
}

export function buildTaskQueue(
  input: TaskQueueInput,
  today: Date,
): QueueTask[] {
  const year = berlinYear(today);
  const month = berlinMonth(today);
  const fmt = formatMoney;
  const tasks: Candidate[] = [];

  // 1. WGB überschritten — pinned rank 0, red.
  if (input.wgb.status === "ueberschritten") {
    tasks.push({
      id: "wgb-ueberschritten",
      tier: 0,
      severity: "critical",
      title: `Freigrenze § 64 AO überschritten — ${fmt(input.wgb.einnahmenCents)} von ${fmt(input.wgb.freigrenzeCents)}`,
      subline: "Sphären-Zuordnung der Buchungen prüfen",
      ctaLabel: "Buchungen prüfen",
      href: "/app/einnahmen?sphaere=wirtschaftlich",
    });
  }

  // 2. WGB nähert sich — warn tiers (loader: erhoeht 80–95 %, kritisch 95–100 %).
  if (input.wgb.status === "erhoeht" || input.wgb.status === "kritisch") {
    const pct = Math.round(
      (input.wgb.einnahmenCents / input.wgb.freigrenzeCents) * 100,
    );
    tasks.push({
      id: "wgb-warn",
      tier: 1,
      severity: "warn",
      title: `WGB zu ${pct} % ausgeschöpft — ${fmt(input.wgb.einnahmenCents)} von ${fmt(input.wgb.freigrenzeCents)}`,
      ctaLabel: "Buchungen prüfen",
      href: "/app/einnahmen?sphaere=wirtschaftlich",
    });
  }

  // 3. Belegprüfung — directly above Erstattungen (pipeline: tiers 2 → 3).
  if (input.openAuslagenCount > 0) {
    const n = input.openAuslagenCount;
    tasks.push({
      id: "belegpruefung",
      tier: 2,
      title:
        n === 1
          ? "1 Auslage wartet auf Prüfung"
          : `${n} Auslagen warten auf Prüfung`,
      ctaLabel: "Prüfen",
      href: "/app/inbox",
    });
  }

  // 4. Erstattungen freigegeben.
  if (input.approvedNotErstattetCount > 0) {
    const n = input.approvedNotErstattetCount;
    tasks.push({
      id: "erstattungen",
      tier: 3,
      title:
        n === 1 ? "1 Erstattung freigegeben" : `${n} Erstattungen freigegeben`,
      amountCents: input.approvedNotErstattetSumCents,
      ctaLabel: "Zur Überweisungsliste",
      href: "/app/ausgaben/ueberweisungen",
    });
  }

  // 5. Beiträge überfällig (count-only — the overdue SUM is a deferred loader
  //    addition, spec §11; never show a number that could be wrong).
  if (input.overdueCount > 0) {
    const n = input.overdueCount;
    tasks.push({
      id: "beitraege-ueberfaellig",
      tier: 4,
      title: n === 1 ? "1 Beitrag überfällig" : `${n} Beiträge überfällig`,
      ctaLabel: "Ansehen",
      href: "/app/mitglieder?view=matrix&filter=ueberfaellig",
    });
  }

  // 6. Beiträge offen — DEDUPED against the überfällig row.
  const weitereOffen = input.openMemberCount - input.overdueCount;
  if (weitereOffen > 0) {
    const n = weitereOffen;
    const hatUeberfaellig = input.overdueCount > 0;
    tasks.push({
      id: "beitraege-offen",
      tier: 5,
      title: hatUeberfaellig
        ? n === 1
          ? "1 weiterer Beitrag offen"
          : `${n} weitere Beiträge offen`
        : n === 1
          ? "1 Beitrag offen"
          : `${n} Beiträge offen`,
      ctaLabel: "Ansehen",
      href: "/app/mitglieder?view=matrix&filter=offen",
    });
  }

  // 7. Jahresabschluss — Berlin dates. January wording must NOT claim the
  //    close is blocked (it is not — verified, spec §7).
  if ((input.festgeschriebenBis ?? 0) < year - 1) {
    const closeYear = year - 1;
    const escalated = month >= 7;
    tasks.push({
      id: "jahresabschluss",
      tier: 6,
      ...(escalated ? { severity: "warn" as const } : {}),
      title:
        month === 1
          ? `Jahresabschluss ${closeYear} — empfohlen ab Februar`
          : escalated
            ? `Jahresabschluss ${closeYear} ist überfällig`
            : `Jahresabschluss ${closeYear} steht an`,
      ctaLabel: "Zum Jahresabschluss",
      href: "/app/jahresabschluss",
    });
  }

  // 8. Vorjahres-Beiträge — N counts YEARS (priorYearsUnpaidCount semantics).
  if (input.priorYearsUnpaidCount > 0) {
    const n = input.priorYearsUnpaidCount;
    tasks.push({
      id: "vorjahres-beitraege",
      tier: 7,
      title:
        n === 1
          ? "Offene Beiträge aus 1 Vorjahr"
          : `Offene Beiträge aus ${n} Vorjahren`,
      ctaLabel: "Ansehen",
      href: "/app/mitglieder?view=matrix&filter=offen",
    });
  }

  tasks.sort(compareTasks);

  // Rail assignment. The rank-1 gradient spine exists ONLY when no critical
  // task is pinned at rank 0 AND the top row has no severity of its own.
  const rank1Idx =
    tasks.length > 0 && tasks[0]!.severity === undefined ? 0 : -1;
  return tasks.map((t, i) => ({
    ...t,
    railKind:
      t.severity === "critical"
        ? "critical"
        : t.severity === "warn"
          ? "warn"
          : i === rank1Idx
            ? "rank1"
            : "default",
  }));
}
