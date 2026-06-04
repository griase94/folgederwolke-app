export type SpendeKind = "geldspende" | "sachspende" | "aufwandsspende";
export type ZweckbindungKind = "zweckfrei" | "zweckgebunden";
/** (Spendenart, Zweckbindung) → seeded income-Kategorie name (spec §4.3/§4.4). */
export function deriveDonationKategorieName(
  spendeKind: SpendeKind,
  zweckbindungKind: ZweckbindungKind,
): string {
  if (spendeKind === "sachspende") return "Sachspende";
  if (spendeKind === "aufwandsspende") return "Aufwandsspende"; // Phase 2
  return zweckbindungKind === "zweckgebunden"
    ? "Geldspende zweckgebunden"
    : "Geldspende zweckfrei";
}
