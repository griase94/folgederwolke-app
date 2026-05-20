/**
 * Transaction kind URL-param mapping (C7-1 / C3 shared helper).
 *
 * The FabBottomSheet and various UI entry points link to
 *   /app/transactions/neu?kind=ausgabe|einnahme|spende
 * using German slugs because the URL surfaces in screenshots, browser
 * history, share links, etc. — `?kind=expense` would feel out of place in
 * an otherwise German admin UI. Internally the domain uses the English
 * enum TransactionKind = "expense" | "income" | "donation".
 *
 * This helper bridges the two so callers never have to mix locales.
 * Accepts EITHER spelling so old links / typos don't 404 / silently fall
 * back to "expense".
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

/**
 * Build a `/app/transactions/neu?kind=<slug>` URL for a domain kind.
 *
 * Use this in components (FabBottomSheet, dashboard quick-actions) so the
 * outgoing slug stays in sync with the incoming parser.
 */
export function buildNeuUrlForKind(kind: TransactionKind): string {
  return `/app/transactions/neu?kind=${KIND_EN_TO_DE[kind]}`;
}
