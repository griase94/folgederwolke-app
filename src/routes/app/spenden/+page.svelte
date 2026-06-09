<script lang="ts">
  import { page } from "$app/stores";
  import TransactionListScaffold from "$lib/components/admin/transactions/TransactionListScaffold.svelte";
  import SpendenKpi from "$lib/components/admin/transactions/spenden/SpendenKpi.svelte";
  import {
    spendenColumns,
    spendeArtLabel,
    zweckbindungLabel,
  } from "$lib/components/admin/transactions/spenden/columns.js";
  import Money from "$lib/components/ui/money/money.svelte";
  import type { SpendenRow } from "$lib/server/domain/transactions.js";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  // §9.1 columns — declared against SpendenRow so each cell reads the per-tab
  // fields (spenderName / spendeKind / zweckbindungKind / bescheinigungNr)
  // directly, no casts. Markup lives in the auto-escaped {#snippet} blocks below.
  const columns = spendenColumns({
    datum: datumCell,
    id: idCell,
    spender: spenderCell,
    art: artCell,
    zweckbindung: zweckbindungCell,
    betrag: betragCell,
    bescheinigung: bescheinigungCell,
  });

  function formatDatum(iso: string): string {
    return new Date(iso).toLocaleDateString("de-DE");
  }
</script>

<svelte:head>
  <title>Spenden – {$page.data.vereinName}</title>
</svelte:head>

{#snippet kpi()}
  <SpendenKpi
    totalCents={data.kpi.totalCents}
    count={data.kpi.count}
    ohneBescheinigungCount={data.kpi.ohneBescheinigungCount}
    versandtCount={data.kpi.versandtCount}
    year={data.yearScope}
  />
{/snippet}

{#snippet datumCell(row: SpendenRow)}
  <span class="text-muted-foreground">{formatDatum(row.gebuchtAm)}</span>
{/snippet}

{#snippet idCell(row: SpendenRow)}
  <span class="font-mono text-xs text-muted-foreground">{row.businessId}</span>
{/snippet}

{#snippet spenderCell(row: SpendenRow)}
  <!-- FIX A (review): primary discoverable link so desktop Julia can open a booking. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    href={`/app/spenden/${row.id}`}
    class="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >{row.spenderName ?? "—"}</a
  >
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

{#snippet artCell(row: SpendenRow)}
  <span
    class="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-muted-foreground"
  >
    {spendeArtLabel(row.spendeKind)}
  </span>
{/snippet}

{#snippet zweckbindungCell(row: SpendenRow)}
  <span class="text-sm text-muted-foreground"
    >{zweckbindungLabel(row.zweckbindungKind)}</span
  >
{/snippet}

{#snippet betragCell(row: SpendenRow)}
  <Money valueInCents={row.betragCents} />
{/snippet}

{#snippet bescheinigungCell(row: SpendenRow)}
  {#if row.bescheinigungNr}
    <span class="font-mono text-xs text-foreground">{row.bescheinigungNr}</span>
  {:else}
    <span class="text-xs text-muted-foreground/70">ausstehend</span>
  {/if}
{/snippet}

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
  <TransactionListScaffold
    tab="spenden"
    rows={data.rows}
    total={data.total}
    page={data.page}
    pageSize={data.pageSize}
    selectedYear={data.yearScope}
    currentYear={data.currentYear}
    filterState={data.filterState}
    kategorieOptions={data.kategorieOptions}
    memberOptions={data.memberOptions}
    {columns}
    {kpi}
    detailHrefBase="/app/spenden"
    newLabel="Neue Spende"
    newHref="/app/spenden/neu"
  />
</div>
