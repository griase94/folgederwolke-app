/**
 * German display labels for Spenden enums (moved out of the retired
 * spenden/columns.ts in Aurora slice 5 — client-safe, no UI deps).
 */

export function spendeArtLabel(kind: string): string {
  if (kind === "sachspende") return "Sachspende";
  if (kind === "aufwandsspende") return "Aufwandsspende";
  return "Geldspende";
}

export function zweckbindungLabel(kind: string): string {
  return kind === "zweckgebunden" ? "zweckgebunden" : "zweckfrei";
}
