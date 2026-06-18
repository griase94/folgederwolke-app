/**
 * /app/transaktionen — Aurora unified transactions feed (slice 5, spec §8).
 *
 * Chronological UNION-ALL feed over Ausgaben + Einnahmen + Spenden, rendered
 * the same on ALL viewports (the mobile tab target; a phone-shared link
 * opened on desktop just works — no sidebar entry is active here).
 *
 * Thin load: parse the "transaktionen" filter state (?typ= chips + ?q=
 * search), read the layout year scope, clamp ?page into range (IDENTICAL
 * idiom to ausgaben/einnahmen/spenden — see ausgaben/+page.server.ts), call
 * listTransaktionenFeedPage. No actions — every mutation lives on the
 * per-type routes.
 */

import type { PageServerLoad } from "./$types.js";
import { listTransaktionenFeedPage } from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url, parent }) => {
  const { yearScope, currentYear } = await parent();
  const state = parseFilterState("transaktionen", url.searchParams);

  // PAGE CLAMP (see ausgaben/+page.server.ts): clamp the requested page into
  // [1, pages] BEFORE it drives the offset; re-query at the clamped offset
  // only when the request overshot the last page.
  const requestedPage = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1,
  );
  let page = requestedPage;
  let { rows, total } = await listTransaktionenFeedPage({
    state,
    year: yearScope,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) {
    page = pages;
    ({ rows, total } = await listTransaktionenFeedPage({
      state,
      year: yearScope,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  }

  return {
    rows,
    total,
    page,
    pageSize: PAGE_SIZE,
    filterState: state,
    yearScope,
    currentYear,
  };
};
