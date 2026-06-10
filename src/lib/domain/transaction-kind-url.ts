/**
 * Transaction kind URL-param mapping (C7-1 / C3 shared helper).
 *
 * Entry points link to per-tab neu routes:
 *   /app/ausgaben/neu   (expense)
 *   /app/einnahmen/neu  (income)
 *   /app/spenden/neu    (donation)
 *
 * The `?kind=` query param was used by the retired /app/transactions/neu
 * route. The per-tab routes don't need it (kind is implicit in the path),
 * but `parseKindFromUrl` is still used by page.server.ts loaders that
 * accept both German and English spellings from URL params.
 *
 * Internally the domain uses the English enum
 * TransactionKind = "expense" | "income" | "donation".
 *
 * Co-owned by the C3 (dashboard quick-actions) and C7 (mobile FAB) clusters.
 */
import type { TransactionKind } from "$lib/server/domain/transactions.js";

/** German URL slug → domain TransactionKind. `null` means "no preset". */
export const KIND_DE_TO_EN: Record<string, TransactionKind | null> = {
  // German (canonical URL slugs)
  ausgabe: "expense",
  einnahme: "income",
  spende: "donation",
  // English aliases — accept domain enum values too so internal callers /
  // tools that already speak English don't need to translate before linking.
  expense: "expense",
  income: "income",
  donation: "donation",
};

/** Domain TransactionKind → German URL slug (canonical outgoing form). */
export const KIND_EN_TO_DE: Record<TransactionKind, string> = {
  expense: "ausgabe",
  income: "einnahme",
  donation: "spende",
};

/**
 * Parse a `?kind=...` query-param value into a domain TransactionKind.
 *
 * Returns `null` for:
 *  - missing / empty input (no preset → form defaults to its UX default)
 *  - unknown values (e.g., `?kind=foo` — silently ignored, no preset)
 *
 * Case-insensitive (the URL slug is lowercase by convention, but we don't
 * want `?KIND=AUSGABE` from a typo to fall through).
 */
export function parseKindFromUrl(
  raw: string | null | undefined,
): TransactionKind | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  return KIND_DE_TO_EN[normalized] ?? null;
}

/** Domain TransactionKind → per-tab base path (Phase 8 T6). */
const KIND_EN_TO_TAB: Record<TransactionKind, string> = {
  expense: "ausgaben",
  income: "einnahmen",
  donation: "spenden",
};

/**
 * Build the per-tab `/app/{tab}/neu` URL for a domain kind.
 *
 * Phase 8 T6: /app/transactions/neu retired. Entry points now link
 * directly to the per-kind neu route (kind is implicit in the path).
 */
export function buildNeuUrlForKind(kind: TransactionKind): string {
  return `/app/${KIND_EN_TO_TAB[kind]}/neu`;
}
