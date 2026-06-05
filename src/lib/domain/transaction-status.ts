/**
 * Transaction status presentation (pure, no DB) — the SINGLE source of truth for
 * a transaction status's German label + its badge tone (Tailwind classes).
 *
 * Lives under `src/lib/domain/` because both the desktop Ausgaben status column
 * (`/app/ausgaben/+page.svelte`) and the mobile `TransactionCardMobile` render
 * it client-side. Before this module they each carried their own copy and DRIFTED:
 * `geprueft` rendered blue + "Genehmigt" on desktop but amber on the card. One
 * map here keeps a status's label + colour identical everywhere (item 7).
 *
 * The tone is the desktop palette (the richer of the two), expressed as
 * `bg-…/text-…` pairs with dark-mode variants — the card previously used lighter
 * `bg-x-50` tones; unifying on the desktop scale is the intentional choice.
 */

export type TransactionStatus =
  | "zu_pruefen"
  | "in_pruefung"
  | "geprueft"
  | "abgelehnt"
  | "erstattet"
  | "importiert";

export interface StatusPresentation {
  /** German badge label. */
  label: string;
  /** Tailwind badge classes (bg + text, incl. dark-mode variants). */
  tone: string;
}

const NEUTRAL_TONE = "bg-muted text-muted-foreground";

/**
 * Canonical status → { label, tone }. Statuses with no explicit tone fall back
 * to the neutral muted tone via `statusPresentation`.
 */
export const TRANSACTION_STATUS: Record<string, StatusPresentation> = {
  zu_pruefen: { label: "Zu prüfen", tone: NEUTRAL_TONE },
  in_pruefung: { label: "In Prüfung", tone: NEUTRAL_TONE },
  geprueft: {
    label: "Genehmigt",
    tone: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  },
  abgelehnt: {
    label: "Abgelehnt",
    tone: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  },
  erstattet: {
    label: "Erstattet",
    tone: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  },
  importiert: { label: "Importiert", tone: NEUTRAL_TONE },
};

/**
 * Resolve a status to its `{ label, tone }`. Unknown statuses degrade to the raw
 * value as label + the neutral tone, so an unexpected DB value never blanks out.
 */
export function statusPresentation(status: string): StatusPresentation {
  return TRANSACTION_STATUS[status] ?? { label: status, tone: NEUTRAL_TONE };
}
