/**
 * IBAN formatting helpers for the form UI.
 *
 * formatIban:  "DE89370400440532013000" → "DE89 3704 0044 0532 0130 00"
 * normalizeIban: strips spaces + uppercases (ready for server submission)
 */

export function formatIban(raw: string): string {
  // Strip everything that's not alphanumeric, uppercase
  const clean = raw.replace(/\s/g, "").toUpperCase();
  // Group into chunks of 4
  return clean.match(/.{1,4}/g)?.join(" ") ?? clean;
}

export function normalizeIban(formatted: string): string {
  // Strip spaces and dashes (dashes are sometimes typed as visual separators)
  // NOTE: The server-side equivalent in $lib/server/domain/iban.ts only strips
  // spaces, not dashes. If dash-IBAN input is ever accepted server-side, that
  // function should be updated too (tracked as auto-fix-F Phase 1 follow-up).
  return formatted.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Handler for input events — formats the IBAN as you type.
 * Usage: <input on:input={handleIbanInput} />
 */
export function handleIbanInput(
  e: Event & { currentTarget: HTMLInputElement },
): void {
  const input = e.currentTarget;
  const start = input.selectionStart ?? 0;
  const oldValue = input.value;
  const formatted = formatIban(oldValue);
  input.value = formatted;

  // Adjust cursor: count how many non-space characters are before the old cursor,
  // then find the same position in the formatted string.
  const charsBeforeCursor = oldValue.slice(0, start).replace(/\s/g, "").length;
  let newPos = 0;
  let count = 0;
  while (newPos < formatted.length && count < charsBeforeCursor) {
    if (formatted[newPos] !== " ") count++;
    newPos++;
  }
  // Account for space that might be inserted right at cursor
  if (formatted[newPos] === " ") newPos++;
  input.setSelectionRange(newPos, newPos);
}
