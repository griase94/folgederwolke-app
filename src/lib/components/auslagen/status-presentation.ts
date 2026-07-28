/**
 * Auslage-status presentation map (Aurora A-flow S1).
 *
 * `deriveStatus` (server, `domain/auslage-status.ts`) is the single source of
 * the canonical status. THIS module is the single source of how that status
 * PRESENTS in the public + portal UI: medallion tone, status-chip variant,
 * eyebrow, and the short pill label. eingereicht, status, the batch group, and
 * the portal list all read it — so the tone of "in Prüfung" (brand-neutral,
 * never amber — ANDY-LENS §4) can never drift between screens.
 *
 * The amount is deliberately NOT part of this map: it stays PLUM in every
 * state (`type-ausgabe`); the medallion + chip carry the tone, never the number.
 */

import type { AuslageStatus } from "$lib/server/domain/auslage-status.js";
import type { MedallionTone } from "$lib/components/ui/StatusMedallion.svelte";

/** Status-chip / tally tone. ok=green, open=brand-neutral, crit=red. */
export type StatusChipVariant = "ok" | "open" | "crit";

export interface StatusPresentation {
  medallion: MedallionTone;
  chip: StatusChipVariant;
  /** Short uppercase eyebrow over the headline. */
  eyebrow: string;
  /** Short pill label (batch tally + node chip). */
  pill: string;
}

const MAP: Record<AuslageStatus, StatusPresentation> = {
  eingegangen: {
    medallion: "pruef",
    chip: "open",
    eyebrow: "Eingegangen",
    pill: "Eingegangen",
  },
  in_pruefung: {
    medallion: "pruef",
    chip: "open",
    eyebrow: "In Prüfung",
    pill: "In Prüfung",
  },
  geprueft: {
    medallion: "frei",
    chip: "open",
    eyebrow: "Freigegeben",
    pill: "Freigegeben",
  },
  erstattet: {
    medallion: "done",
    chip: "ok",
    eyebrow: "Erstattet",
    pill: "Erstattet",
  },
  abgelehnt: {
    medallion: "reject",
    chip: "crit",
    eyebrow: "Abgelehnt",
    pill: "Abgelehnt",
  },
};

export function statusPresentation(status: AuslageStatus): StatusPresentation {
  return MAP[status];
}
