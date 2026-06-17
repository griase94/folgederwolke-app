<script lang="ts">
  /**
   * /app/ausgaben — Ausgaben list page (Phase 4, Tier C1).
   *
   * Binds the shared (generic) `TransactionListScaffold` to the Ausgaben row type
   * (`AusgabenRow`) with: an `AusgabenKpi` header pill snippet, the Ausgaben
   * `columns` (Datum, ID mono, Bezeichnung + Bezahlt-von subtitle, Bezahlt von,
   * Kategorie, the §13 Sphäre LEFT COLOR-RULE — a thin tone bar, not a filled
   * badge —, Betrag right via Money, Status badge, chevron). Bulk Erstattung
   * moved to /app/ausgaben/ueberweisungen (Aurora slice 4).
   */
  import { page } from "$app/stores";
  import TransactionListScaffold from "$lib/components/admin/transactions/TransactionListScaffold.svelte";
  import AusgabenKpi from "$lib/components/admin/transactions/ausgaben/AusgabenKpi.svelte";
  import { ausgabenColumns } from "$lib/components/admin/transactions/ausgaben/columns.js";
  import Money from "$lib/components/ui/money/money.svelte";
  import type { Sphere } from "$lib/domain/sphere.js";
  import { SPHERE_LABELS } from "$lib/domain/sphere.js";
  import { statusPresentation } from "$lib/domain/transaction-status.js";
  import type { AusgabenRow } from "$lib/server/domain/transactions.js";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  // ── C3-DISC: single-row "Bezahlt markieren" kebab state ──────────────────
  // `markPaidRowId` tracks which row (if any) has the inline mark-paid dialog
  // open. Only one row can have it open at a time. Set to null to close.
  let markPaidRowId = $state<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  let markPaidDatum = $state(today);

  // ── Sphäre LEFT color-rule (§13) ──────────────────────────────────────────
  // A thin vertical tone bar keyed on the row's sphere — NOT the filled
  // SphereBadge (that lives on the detail page). Mirrors the §13 palette (the
  // solid tone of each Sphäre) so the list stays calm (a quiet left edge) while
  // the four Sphären stay legible.
  const SPHERE_RULE: Record<Sphere, string> = {
    ideeller: "bg-pink-400 dark:bg-pink-500",
    vermoegen: "bg-blue-400 dark:bg-blue-500",
    zweckbetrieb: "bg-violet-400 dark:bg-violet-500",
    wirtschaftlich: "bg-amber-400 dark:bg-amber-500",
  };

  function ruleFor(sphere: string): string {
    return SPHERE_RULE[sphere as Sphere] ?? "bg-border";
  }

  function sphereLabel(sphere: string): string {
    return SPHERE_LABELS[sphere as Sphere] ?? sphere;
  }

  // ── Status badge ─────────────────────────────────────────────────────────
  // Label + tone come from the SHARED transaction-status map so the desktop
  // column and the mobile card never drift (item 7).

  function formatDatum(iso: string): string {
    return new Date(iso).toLocaleDateString("de-DE");
  }

  const columns = ausgabenColumns({
    datum: datumCell,
    id: idCell,
    bezeichnung: bezeichnungCell,
    bezahltVon: bezahltVonCell,
    kategorie: kategorieCell,
    sphaere: sphaereCell,
    betrag: betragCell,
    status: statusCell,
    kebab: kebabCell,
    chevron: chevronCell,
  });
</script>

<svelte:head>
  <title>Ausgaben – {$page.data.vereinName}</title>
</svelte:head>

<!-- ── KPI header strip ────────────────────────────────────────────────────── -->
{#snippet kpi()}
  <AusgabenKpi
    totalCents={data.kpi.totalCents}
    count={data.kpi.count}
    offenCount={data.kpi.offenCount}
    oldestOpenAgeDays={data.kpi.oldestOpenAgeDays}
    year={data.yearScope}
  />
{/snippet}

<!-- ── Column cells (typed on AusgabenRow — no casts) ──────────────────────── -->
{#snippet sphaereCell(row: AusgabenRow)}
  <span
    role="img"
    data-testid="sphaere-rule"
    data-sphere={row.sphereSnapshot}
    aria-label={sphereLabel(row.sphereSnapshot)}
    title={sphereLabel(row.sphereSnapshot)}
    class={["block h-6 w-1 rounded-full", ruleFor(row.sphereSnapshot)].join(
      " ",
    )}
  ></span>
{/snippet}

{#snippet datumCell(row: AusgabenRow)}
  <span class="whitespace-nowrap text-muted-foreground"
    >{formatDatum(row.gebuchtAm)}</span
  >
{/snippet}

{#snippet idCell(row: AusgabenRow)}
  <span class="font-mono text-xs text-muted-foreground">{row.businessId}</span>
{/snippet}

{#snippet bezeichnungCell(row: AusgabenRow)}
  <!-- FIX A (review): primary discoverable link so desktop Julia can open a booking. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    href={`/app/ausgaben/${row.id}`}
    class="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >{row.bezeichnung}</a
  >
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {#if row.bezahltVonDisplay}
    <span class="mt-0.5 block text-xs text-muted-foreground"
      >{row.bezahltVonDisplay}</span
    >
  {/if}
{/snippet}

{#snippet bezahltVonCell(row: AusgabenRow)}
  <span class="text-muted-foreground">{row.bezahltVonDisplay}</span>
{/snippet}

{#snippet kategorieCell(row: AusgabenRow)}
  <span class="text-muted-foreground">{row.kategorieNameSnapshot}</span>
{/snippet}

{#snippet betragCell(row: AusgabenRow)}
  <Money
    valueInCents={-row.betragCents}
    class="whitespace-nowrap font-medium"
  />
{/snippet}

{#snippet statusCell(row: AusgabenRow)}
  <span
    data-testid="txn-row-status"
    class={[
      "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
      statusPresentation(row.status).tone,
    ].join(" ")}
  >
    {statusPresentation(row.status).label}
  </span>
{/snippet}

<!-- C3-DISC: row-level kebab — "Bezahlt markieren" (geprueft/not-yet-erstattet). -->
{#snippet kebabCell(row: AusgabenRow)}
  {#if !row.festgeschriebenAt && row.status === 'geprueft'}
    <div class="relative flex justify-end">
      <button
        type="button"
        aria-label="Aktionen für Auslage"
        data-testid="txn-row-kebab"
        onclick={() => {
          markPaidRowId = markPaidRowId === row.id ? null : row.id;
          markPaidDatum = today;
        }}
        class="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {#if markPaidRowId === row.id}
        <div
          class="absolute right-0 top-8 z-10 w-44 rounded-md border border-border bg-background shadow-md"
        >
          <button
            type="button"
            data-testid="txn-row-mark-paid"
            onclick={() => { /* dialog already opens via markPaidRowId */ }}
            class="w-full px-3 py-2 text-left text-sm hover:bg-muted"
          >
            Bezahlt markieren
          </button>
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<!-- C3-DISC: inline mark-paid dialog row (rendered via rowAfter). -->
{#snippet rowAfterSnippet(row: AusgabenRow)}
  {#if markPaidRowId === row.id}
    <tr data-testid="mark-paid-dialog" data-row-id={row.id}>
      <td colspan="10" class="border-b border-border bg-muted/30 px-4 py-3">
        <form
          method="POST"
          action="?/mark-paid"
          use:enhance={() => {
            return async ({ result }) => {
              if (result.type === 'success') {
                toast.success('Als bezahlt markiert');
                markPaidRowId = null;
                await invalidateAll();
              } else if (result.type === 'failure') {
                const err = (result.data as { error?: string } | undefined)?.error;
                toast.error(err ?? 'Als bezahlt markieren fehlgeschlagen');
              }
            };
          }}
          class="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="expenseId" value={row.id} />
          <input
            type="date"
            name="datum"
            lang="de"
            bind:value={markPaidDatum}
            required
            class="h-9 rounded-md border border-border bg-background px-2 text-sm"
          />
          <button
            type="submit"
            data-testid="mark-paid-submit"
            class="inline-flex h-9 items-center rounded-md bg-primary-strong px-3 text-sm font-medium text-primary-foreground hover:bg-primary-strong/90"
          >
            Speichern
          </button>
          <button
            type="button"
            onclick={() => (markPaidRowId = null)}
            class="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
          >
            Abbrechen
          </button>
        </form>
      </td>
    </tr>
  {/if}
{/snippet}

{#snippet chevronCell(row: AusgabenRow)}
  <!-- FIX A (review): real <a> so chevron is keyboard-focusable on desktop. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    href={`/app/ausgaben/${row.id}`}
    aria-label="Detail öffnen"
    class="inline-flex h-11 min-h-11 w-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    ><span aria-hidden="true">›</span></a
  >
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
{/snippet}

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
  <div class="mb-3 flex justify-end">
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      href="/app/ausgaben/ueberweisungen"
      class="text-sm font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) rounded"
    >Zur Überweisungsliste →</a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  </div>
  <TransactionListScaffold
    tab="ausgaben"
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
    detailHrefBase="/app/ausgaben"
    newLabel="Neue Ausgabe"
    newHref="/app/ausgaben/neu"
    rowAfter={rowAfterSnippet}
  />
</div>
