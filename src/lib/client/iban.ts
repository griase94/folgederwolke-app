/**
 * DOM-facing IBAN helpers for form inputs.
 *
 * The pure logic (normalize / validate / format / mask) lives in
 * `$lib/domain/iban.ts` and is shared with the server — only the input-event
 * handler below needs the DOM, so only it lives here. Client and server now
 * normalize identically, so an IBAN the form accepts is never one the server
 * rejects over a typed dash.
 */

import { formatIban, normalizeIban } from "$lib/domain/iban.js";

export { formatIban, normalizeIban, validateIban } from "$lib/domain/iban.js";

/**
 * Handler for input events — formats the IBAN as you type and keeps the caret
 * where the typist expects it.
 * Usage: <input oninput={handleIbanInput} />
 */
export function handleIbanInput(
  e: Event & { currentTarget: HTMLInputElement },
): void {
  const input = e.currentTarget;
  const start = input.selectionStart ?? 0;
  const oldValue = input.value;
  const formatted = formatIban(oldValue);
  input.value = formatted;

  // Adjust caret: count the non-space characters before the old caret, then
  // find the same position in the formatted string.
  const charsBeforeCursor = normalizeIban(oldValue.slice(0, start)).length;
  let newPos = 0;
  let count = 0;
  while (newPos < formatted.length && count < charsBeforeCursor) {
    if (formatted[newPos] !== " ") count++;
    newPos++;
  }
  // Account for a space that would land right at the caret.
  if (formatted[newPos] === " ") newPos++;
  input.setSelectionRange(newPos, newPos);
}
