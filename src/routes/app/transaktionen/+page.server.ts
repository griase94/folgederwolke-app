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
import {
  listTransaktionenFeedPage,
  countTransaktionenFeedByKind,
} from "$lib/server/domain/transactions.js";
import { parseFilterState } from "$lib/domain/transaction-filters.js";

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url, parent }) => {
  const { yearScope, currentYear } = await parent();
  const state = parseFilterState("transaktionen", url.searchParams);

  // SORT LENS (spec §4.1): whitelist ?sort — only "betrag" flips the lens, any
  // other value (or absent) resolves to "datum" so a tampered ?sort=xyz can
  // never 500 or order by an unlisted axis (acceptance #4). The lens is
  // shareable/bookmarkable; pagination is preserved (the switcher resets page).
  const sort = url.searchParams.get("sort") === "betrag" ? "betrag" : "datum";

  // PAGE CLAMP (see ausgaben/+page.server.ts): clamp the requested page into
  // [1, pages] BEFORE it drives the offset; re-query at the clamped offset
  // only when the request overshot the last page.
  const requestedPage = Math.max(
    1,
    Math.floor(Number(url.searchParams.get("page") ?? "1")) || 1,
  );
  let page = requestedPage;
  let { rows, total, sumCents, monthCount } = await listTransaktionenFeedPage({
    state,
    year: yearScope,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    sort,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) {
    page = pages;
    ({ rows, total, sumCents, monthCount } = await listTransaktionenFeedPage({
      state,
      year: yearScope,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      sort,
    }));
  }

  // Per-kind counts for the filter-chip badges (all three arms, typ ignored).
  const chipCounts = await countTransaktionenFeedByKind({
    state,
    year: yearScope,
  });

  return {
    rows,
    total,
    sumCents,
    monthCount,
    chipCounts,
    sort,
    page,
    pageSize: PAGE_SIZE,
    filterState: state,
    yearScope,
    currentYear,
  };
};
