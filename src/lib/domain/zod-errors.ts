/**
 * Shared Zod-issues → per-field-error mapper.
 *
 * Lifted out of the transaction route +page.server.ts files (ausgaben/einnahmen
 * × neu/[id]), where the identical helper had been copy-pasted four times. A
 * failed `safeParse` returns `parsed.error.issues`; this collapses them into a
 * `{ field: [message] }` map (first message per field wins) that the route
 * returns in its `fail(422, { errors })` payload for the form to render inline.
 */
export function errorsFromIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "_");
    if (!errors[key]) errors[key] = [issue.message];
  }
  return errors;
}
