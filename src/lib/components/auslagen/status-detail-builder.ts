/**
 * Status presentation builder (Aurora A-flow S1). Turns a raw status node (from
 * the /auslage-status loader) into the props AuslageStatusDetail + the aside
 * render — the per-status facts, timeline, next-step/reject copy of the plate,
 * in one place so the single view AND each BatchStatusGroup node read the same
 * truth. Amounts are always PLUM (`tone: 'ausgabe'`); the medallion/chip carry
 * the status tone, never the number (ANDY-LENS §4).
 */

import type { AuslageStatus } from "$lib/server/domain/auslage-status.js";
import type { FactRow } from "$lib/components/ui/facts-table/FactsTable.svelte";
import type { TimelineEvent } from "$lib/components/ui/status-timeline/StatusTimeline.svelte";
import type { AuslageStatusDetailProps } from "$lib/components/public/AuslageStatusDetail.svelte";
import { formatMoney } from "$lib/components/ui/money/money.svelte";

export interface StatusNode {
  ausId: string;
  bezeichnung: string;
  betragCents: number;
  status: AuslageStatus;
  submittedAt: string;
  decidedAt: string | null;
  rechnungsdatum: string | null;
  erstattetAm: string | null;
  rejectReason: string | null;
  maskedIban: string | null;
  belegFileName: string | null;
}

function deDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE");
}

function amountRow(cents: number): FactRow {
  return {
    label: "Betrag",
    value: formatMoney(cents),
    variant: "amount",
    tone: "ausgabe",
  };
}

/** The facts grid (amount plum; masked IBAN nowrap; dates tabular). */
function factsFor(node: StatusNode): FactRow[] {
  const rows: FactRow[] = [
    { label: "Zweck", value: node.bezeichnung },
    amountRow(node.betragCents),
  ];
  if (node.status === "erstattet") {
    const paid = deDate(node.erstattetAm);
    if (paid)
      rows.push({ label: "Überwiesen am", value: paid, variant: "num" });
    if (node.maskedIban)
      rows.push({ label: "Auf IBAN", value: node.maskedIban, variant: "iban" });
    return rows;
  }
  if (node.status === "geprueft") {
    const freed = deDate(node.decidedAt);
    if (freed)
      rows.push({ label: "Freigegeben am", value: freed, variant: "num" });
  } else {
    const inv = deDate(node.rechnungsdatum);
    if (inv) rows.push({ label: "Rechnungsdatum", value: inv, variant: "num" });
  }
  // Reject drops the IBAN (plate); the others show it (extern only).
  if (node.status !== "abgelehnt" && node.maskedIban) {
    rows.push({ label: "IBAN", value: node.maskedIban, variant: "iban" });
  }
  return rows;
}

function timelineFor(node: StatusNode): TimelineEvent[] {
  const submitted = deDate(node.submittedAt) ?? "";
  const eingereicht: TimelineEvent = {
    title: "Eingereicht",
    timestamp: submitted,
    state: "done",
    detail: "Beleg & Betrag sind angekommen.",
  };
  switch (node.status) {
    case "eingegangen":
      return [
        eingereicht,
        {
          title: "Prüfung",
          timestamp: "offen",
          state: "pending",
          detail: "Julia schaut sich Betrag und Beleg an.",
        },
        {
          title: "Erstattung",
          timestamp: "bald",
          state: "pending",
          detail: "Kommt nach der Freigabe aufs Konto.",
        },
      ];
    case "in_pruefung":
      return [
        eingereicht,
        {
          title: "In Prüfung",
          timestamp: "jetzt",
          state: "now",
          detail: "Julia prüft Betrag und Beleg.",
        },
        {
          title: "Erstattung",
          timestamp: "bald",
          state: "pending",
          detail: "Kommt nach der Freigabe aufs Konto.",
        },
      ];
    case "geprueft":
      return [
        eingereicht,
        {
          title: "Freigegeben",
          timestamp: deDate(node.decidedAt) ?? "",
          state: "done",
          detail: "Julia hat alles bestätigt.",
        },
        {
          title: "Wartet auf Überweisung",
          timestamp: "jetzt",
          state: "now",
          detail: "Julia überweist als Nächstes.",
        },
      ];
    case "erstattet":
      return [
        eingereicht,
        {
          title: "Freigegeben",
          timestamp: deDate(node.decidedAt) ?? "",
          state: "done",
          detail: "Julia hat alles bestätigt.",
        },
        {
          title: "Erstattet",
          timestamp: deDate(node.erstattetAm) ?? "",
          state: "done",
          detail: node.maskedIban
            ? `Überwiesen auf ${node.maskedIban}.`
            : "Überwiesen.",
        },
      ];
    case "abgelehnt":
      return [
        eingereicht,
        {
          title: "Abgelehnt",
          timestamp: deDate(node.decidedAt) ?? "",
          state: "reject",
          detail: "Grund oben — leicht zu korrigieren.",
        },
      ];
  }
}

const NEXT_STEP: Record<
  Exclude<AuslageStatus, "abgelehnt">,
  AuslageStatusDetailProps["nextStep"]
> = {
  eingegangen: {
    tone: "brand",
    title: "Als Nächstes: Julia prüft",
    subtitle:
      "Sobald sie freigibt, kommt das Geld zurück aufs Konto — meist in wenigen Tagen.",
  },
  in_pruefung: {
    tone: "brand",
    title: "Du musst nichts tun",
    subtitle:
      "Julia schaut sich das gerade an. Wir melden uns per Mail, sobald es weitergeht.",
  },
  geprueft: {
    tone: "info",
    title: "Julia überweist als Nächstes",
    subtitle:
      "Deine Auslage steht auf der Überweisungsliste. Wir sagen dir per Mail Bescheid, sobald das Geld raus ist.",
  },
  erstattet: {
    tone: "ok",
    title: "Alles erledigt",
    subtitle:
      "Das Geld ist auf dem Weg zu dir. Tausend Dank für deinen Einsatz.",
  },
};

/** The AuslageStatusDetail props for one node (single view or batch node body). */
export function buildNodeDetail(
  node: StatusNode,
  opts: { compact?: boolean; recoveryHref?: string } = {},
): AuslageStatusDetailProps {
  const isReject = node.status === "abgelehnt";
  return {
    factsRows: factsFor(node),
    beleg: node.belegFileName ? { fileName: node.belegFileName } : null,
    nextStep: isReject
      ? null
      : NEXT_STEP[node.status as Exclude<AuslageStatus, "abgelehnt">],
    reject:
      isReject && node.rejectReason
        ? { reason: node.rejectReason, when: deDate(node.decidedAt) }
        : null,
    recoveryHref: isReject
      ? (opts.recoveryHref ?? "/auslage-einreichen")
      : null,
    timeline: timelineFor(node),
    compact: opts.compact,
  };
}

export interface SingleAside {
  eyebrow: string;
  headline: string;
  sub: string;
}

/** Aside copy for the single-node status view (the batch view builds its own). */
export function buildSingleAside(node: StatusNode): SingleAside {
  switch (node.status) {
    case "eingegangen":
      return {
        eyebrow: "Eingegangen",
        headline: "Angekommen — wir haben deine Auslage",
        sub: "Danke, dass du in Vorkasse gegangen bist. Deine Einreichung liegt bei uns, Julia schaut bald drüber — du musst nix weiter tun.",
      };
    case "in_pruefung":
      return {
        eyebrow: "In Prüfung",
        headline: "Deine Auslage wird gerade geprüft",
        sub: "Alles angekommen. Julia schaut sich deine Einreichung jetzt an — du musst nichts weiter tun.",
      };
    case "geprueft":
      return {
        eyebrow: "Freigegeben",
        headline: "Passt alles — deine Auslage ist freigegeben",
        sub: "Julia hat deine Auslage freigegeben. Als Nächstes überweist sie dir das Geld — du kriegst eine Mail, sobald es raus ist.",
      };
    case "erstattet":
      return {
        eyebrow: "Erstattet",
        headline: "Erledigt — Geld ist raus.",
        sub: "Vorkasse-Modus aus, Wolken-Modus an. In 1–3 Werktagen auf deinem Konto.",
      };
    case "abgelehnt":
      return {
        eyebrow: "Abgelehnt",
        headline: "So klappt's noch nicht — aber kein Drama",
        sub: "Diese Auslage können wir in der Form noch nicht erstatten. Julia sagt dir genau, warum — und wie du's leicht hinbekommst.",
      };
  }
}
