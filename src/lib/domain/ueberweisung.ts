/**
 * Überweisungsliste copy helpers (Aurora slice 4, spec §7).
 *
 * Pure + client-safe. Field order is BINDING: German banking forms ask
 * Empfängername first (Verification-of-Payee rejects mismatches), then IBAN,
 * Betrag, Verwendungszweck.
 *
 * Betrag here is the ONE sanctioned exception to "format via formatMoney":
 * banking amount fields want a bare comma-decimal ("84,50"), not "84,50 €".
 */

export interface UeberweisungClaim {
  businessId: string;
  bezeichnung: string;
  betragCents: number;
  bezahltVonKind: string;
  bezahltVonDisplay: string;
  externIban: string | null;
  externName: string | null;
  memberIban: string | null;
}

export const COPY_FIELD_ORDER = ["name", "iban", "betrag", "zweck"] as const;
export type CopyField = (typeof COPY_FIELD_ORDER)[number];

export const COPY_FIELD_LABELS: Record<CopyField, string> = {
  name: "Empfängername",
  iban: "IBAN",
  betrag: "Betrag",
  zweck: "Verwendungszweck",
};

export function claimIban(c: UeberweisungClaim): string | null {
  const iban = c.bezahltVonKind === "extern" ? c.externIban : c.memberIban;
  return iban && iban.length > 0 ? iban : null;
}

export function claimName(c: UeberweisungClaim): string {
  if (c.bezahltVonKind === "extern" && c.externName) return c.externName;
  return c.bezahltVonDisplay;
}

export function claimBetragText(c: UeberweisungClaim): string {
  return (c.betragCents / 100).toFixed(2).replace(".", ",");
}

/** SEPA Verwendungszweck is capped at 140 chars. */
export function claimZweck(c: UeberweisungClaim): string {
  return `${c.businessId} ${c.bezeichnung}`.slice(0, 140);
}

export function claimCopyValue(c: UeberweisungClaim, field: CopyField): string {
  switch (field) {
    case "name":
      return claimName(c);
    case "iban":
      return claimIban(c) ?? "";
    case "betrag":
      return claimBetragText(c);
    case "zweck":
      return claimZweck(c);
  }
}
