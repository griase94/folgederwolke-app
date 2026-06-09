<script lang="ts">
  import { page } from "$app/stores";
  import TransactionListScaffold from "$lib/components/admin/transactions/TransactionListScaffold.svelte";
  import Money from "$lib/components/ui/money/money.svelte";
  import EinnahmenKpi from "$lib/components/admin/transactions/einnahmen/EinnahmenKpi.svelte";
  import BezeichnungCell from "$lib/components/admin/transactions/einnahmen/BezeichnungCell.svelte";
  import SphereRuleCell from "$lib/components/admin/transactions/einnahmen/SphereRuleCell.svelte";
  import { buildEinnahmenColumns } from "$lib/components/admin/transactions/einnahmen/columns.js";
  import type { EinnahmenRow } from "$lib/server/domain/transactions.js";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  // Einnahmen columns (🔗 badge, Sphäre left-rule, no status, no bulk). The
  // render snippets are authored below and injected into the ColumnDef factory.
  const columns = buildEinnahmenColumns({
    datum: datumCell,
    id: idCell,
    bezeichnung: bezeichnungCell,
    kategorie: kategorieCell,
    sphaere: sphaereCell,
    betrag: betragCell,
  });

  function formatDatum(iso: string): string {
    return new Date(iso).toLocaleDateString("de-DE");
  }
</script>

<svelte:head>
  <title>Einnahmen – {$page.data.vereinName}</title>
</svelte:head>

{#snippet kpi()}
  <EinnahmenKpi
    totalCents={data.kpi.totalCents}
    count={data.kpi.count}
    bySphere={data.kpi.bySphere}
    year={data.yearScope}
  />
{/snippet}

{#snippet datumCell(row: EinnahmenRow)}
  <span class="tabular-nums text-muted-foreground"
    >{formatDatum(row.gebuchtAm)}</span
  >
{/snippet}

{#snippet idCell(row: EinnahmenRow)}
  <span class="font-mono text-xs text-muted-foreground">{row.businessId}</span>
{/snippet}

{#snippet bezeichnungCell(row: EinnahmenRow)}
  <!-- FIX A (review): primary discoverable link so desktop Julia can open a booking. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    href={`/app/einnahmen/${row.id}`}
    class="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    ><BezeichnungCell
      bezeichnung={row.bezeichnung}
      rechnungBusinessId={row.rechnungBusinessId}
    /></a
  >
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

{#snippet kategorieCell(row: EinnahmenRow)}
  <span class="text-muted-foreground">{row.kategorieNameSnapshot}</span>
{/snippet}

{#snippet sphaereCell(row: EinnahmenRow)}
  <SphereRuleCell sphere={row.sphereSnapshot} />
{/snippet}

{#snippet betragCell(row: EinnahmenRow)}
  <Money valueInCents={row.betragCents} />
{/snippet}

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
  <TransactionListScaffold
    tab="einnahmen"
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
    detailHrefBase="/app/einnahmen"
    newLabel="Neue Einnahme"
    newHref="/app/einnahmen/neu"
  />
</div>
