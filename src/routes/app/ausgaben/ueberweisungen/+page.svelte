<script lang="ts">
  /**
   * Überweisungsliste UI (spec §7): per claim, copy buttons in BANK-FORM
   * order Empfängername → IBAN → Betrag → Verwendungszweck; copy icon morphs
   * to a checkmark ~1.2s; missing-IBAN state = disabled IBAN copy + "IBAN
   * fehlt" chip linking to the member (or the expense for extern payers).
   * "Als erstattet markieren" posts the absorbed ?/bulk-mark-erstattet.
   */
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import DateField from '$lib/components/ui/date-field/DateField.svelte';
  import { formatMoney } from '$lib/components/ui/money/money.svelte';
  import {
    COPY_FIELD_ORDER,
    COPY_FIELD_LABELS,
    claimCopyValue,
    claimIban,
    claimName,
  } from '$lib/domain/ueberweisung.js';
  import { berlinYmd } from '$lib/domain/year.js';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import type { ActionResult } from '@sveltejs/kit';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();

  // Default the Erstattungs-Datum to TODAY in Europe/Berlin (ADR-0001) — a raw
  // new Date().toISOString().slice(0,10) is the UTC date, which is the WRONG
  // day for ~1–2 h around midnight Berlin time. berlinYmd() returns YYYY-MM-DD.
  const today = berlinYmd();
  let chosenDate = $state(today);
  let zahlungsartId = $state('');
  $effect(() => {
    if (!zahlungsartId && data.zahlungsarten.length > 0) {
      zahlungsartId = data.zahlungsarten[0]!.id;
    }
  });

  const totalCents = $derived(data.claims.reduce((s, c) => s + c.betragCents, 0));

  // ── copy-to-clipboard with checkmark morph (~1.2s) ────────────────────────
  // The morph is purely visual; copyAnnounce drives an sr-only aria-live region
  // so screen-reader users hear "{label} kopiert" on success too.
  let copiedKey = $state<string | null>(null);
  let copyAnnounce = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  async function copy(key: string, value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error('Kopieren fehlgeschlagen');
      return;
    }
    copiedKey = key;
    copyAnnounce = `${label} kopiert`;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copiedKey = null;
      copyAnnounce = ''; // clear the live region so the announcement isn't stale
    }, 1200);
  }

  // The empty-state paragraph (tabindex=-1) is the focus landing spot once the
  // last claim is marked erstattet — keeps keyboard/SR focus on the page.
  let emptyEl = $state<HTMLParagraphElement | null>(null);

  // ── mark erstattet (absorbed bulk action; per-row posts a single id) ──────
  interface BulkSummary {
    erstattet: string[];
    festgeschrieben: string[];
    bereitsBezahlt: string[];
    notFound: string[];
    fehler: { id: string; error: string }[];
  }
  function summarize(summary: BulkSummary) {
    const parts: string[] = [];
    if (summary.erstattet.length) parts.push(`${summary.erstattet.length} erstattet`);
    if (summary.bereitsBezahlt.length)
      parts.push(`${summary.bereitsBezahlt.length} bereits erstattet`);
    if (summary.festgeschrieben.length)
      parts.push(`${summary.festgeschrieben.length} festgeschrieben`);
    if (summary.notFound.length) parts.push(`${summary.notFound.length} nicht gefunden`);
    if (summary.fehler.length) parts.push(`${summary.fehler.length} fehlgeschlagen`);
    const msg = parts.join(', ') || 'Keine Auslagen verarbeitet';
    const hadProblem =
      summary.festgeschrieben.length > 0 ||
      summary.notFound.length > 0 ||
      summary.fehler.length > 0;
    if (hadProblem) toast.warning(msg);
    else toast.success(msg);
  }

  let posting = $state(false);
  async function markErstattet(ids: string[]) {
    if (!zahlungsartId) {
      toast.error('Bitte Zahlungsart wählen');
      return;
    }
    posting = true;
    try {
      const fd = new FormData();
      fd.set('expenseIds', ids.join(','));
      fd.set('chosenDate', chosenDate);
      fd.set('zahlungsartId', zahlungsartId);
      const res = await fetch('?/bulk-mark-erstattet', { method: 'POST', body: fd });
      const result = deserialize(await res.text()) as ActionResult;
      if (result.type === 'success' && result.data) {
        const payload = result.data as { summary?: BulkSummary };
        if (payload.summary) summarize(payload.summary);
        await invalidateAll();
        // The marked row(s) vanish from the list → the button that had focus is
        // gone. Re-home focus: the next remaining "markieren" button, else the
        // empty-state line. Without this, focus drops to <body>.
        await tick();
        const nextBtn = document.querySelector<HTMLElement>(
          '[data-testid="mark-erstattet"]'
        );
        (nextBtn ?? emptyEl)?.focus();
      } else if (result.type === 'failure') {
        toast.error(
          ((result.data as { error?: string } | undefined)?.error) ?? 'Fehler beim Markieren'
        );
      } else {
        toast.error('Fehler beim Markieren');
      }
    } finally {
      posting = false;
    }
  }
</script>

<svelte:head>
  <title>Überweisungsliste – {page.data.vereinName}</title>
</svelte:head>

{#snippet copyBtn(claimId: string, field: string, label: string, value: string)}
  {@const key = `${claimId}:${field}`}
  <button
    type="button"
    data-testid={`copy-${field}`}
    onclick={() => copy(key, value, label)}
    aria-label={`${label} kopieren`}
    class="inline-flex h-11 items-center gap-1.5 rounded-full border border-(--hairline) bg-white px-3 text-[13px] font-medium text-ink-700 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) md:h-9"
  >
    {#if copiedKey === key}
      <svg class="size-3.5 text-type-einnahme" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    {:else}
      <svg class="size-3.5 text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    {/if}
    {label}
  </button>
{/snippet}

<PageShell width="list">
  <PageHeader title="Überweisungsliste" backHref="/app/ausgaben" backLabel="Ausgaben">
    {#snippet meta()}
      <span class="text-sm tabular-nums text-ink-500">
        {data.claims.length === 1
          ? '1 Erstattung'
          : `${data.claims.length} Erstattungen`} · {formatMoney(totalCents)}
      </span>
    {/snippet}
    {#snippet toolbar()}
      <div class="flex flex-wrap items-center gap-2">
        <label class="text-sm text-ink-500" for="ueberweisung-datum">Datum</label>
        <DateField
          id="ueberweisung-datum"
          name="chosenDate"
          value={chosenDate}
          onchange={(iso) => (chosenDate = iso)}
          required
          class="h-11 md:h-10"
        />
        <label class="text-sm text-ink-500" for="ueberweisung-zahlungsart">Zahlungsart</label>
        <select
          id="ueberweisung-zahlungsart"
          bind:value={zahlungsartId}
          class="h-11 rounded-[10px] border border-(--hairline) bg-white px-2 text-sm md:h-10"
        >
          {#each data.zahlungsarten as za (za.id)}
            <option value={za.id}>{za.label}</option>
          {/each}
        </select>
      </div>
    {/snippet}
  </PageHeader>

  <div aria-live="polite" class="sr-only" data-testid="copy-live">{copyAnnounce}</div>

  {#if data.claims.length === 0}
    <p
      bind:this={emptyEl}
      tabindex="-1"
      class="mt-8 rounded-[8px] text-sm text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-4"
    >
      Keine freigegebenen Erstattungen — alles überwiesen.
    </p>
  {:else}
    <ul class="mt-4 flex flex-col gap-3">
      {#each data.claims as claim (claim.id)}
        {@const iban = claimIban(claim)}
        <li class="rounded-2xl bg-white p-4 shadow-(--shadow-card)" data-testid="ueberweisung-claim">
          <div class="flex items-baseline justify-between gap-3">
            <div class="min-w-0">
              <p class="truncate font-medium text-ink-900">{claimName(claim)}</p>
              <p class="truncate text-xs text-ink-500">{claim.businessId} · {claim.bezeichnung}</p>
            </div>
            <p class="shrink-0 text-base font-semibold tabular-nums text-ink-900">
              {formatMoney(claim.betragCents)}
            </p>
          </div>
          <!-- Mobile: copy chips group on top, the commit button on its own
               full-width row below (clear separation of "prepare" vs "commit").
               Desktop: one row, commit button pushed right. -->
          <div class="mt-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <div class="flex flex-wrap items-center gap-2">
              {#each COPY_FIELD_ORDER as field (field)}
                {#if field === 'iban' && !iban}
                  <button
                    type="button"
                    disabled
                    data-testid="copy-iban-disabled"
                    aria-label="IBAN fehlt – keine IBAN zum Kopieren hinterlegt"
                    title="Keine IBAN hinterlegt"
                    class="inline-flex h-11 cursor-not-allowed items-center rounded-full border border-(--hairline) px-3 text-[13px] text-ink-300 md:h-9"
                  >IBAN</button>
                {:else}
                  {@render copyBtn(
                    claim.id,
                    field,
                    COPY_FIELD_LABELS[field],
                    claimCopyValue(claim, field)
                  )}
                {/if}
              {/each}
              {#if !iban}
                <!-- eslint-disable svelte/no-navigation-without-resolve -->
                <a
                  data-testid="iban-fehlt-chip"
                  href={claim.bezahltVonMemberId
                    ? `/app/mitglieder/${claim.bezahltVonMemberId}`
                    : `/app/ausgaben/${claim.id}`}
                  class="inline-flex items-center rounded-full bg-severity-warn/10 px-2.5 py-1 text-xs font-medium text-severity-warn-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
                >IBAN fehlt</a>
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
              {/if}
            </div>
            <button
              type="button"
              data-testid="mark-erstattet"
              disabled={posting || !iban}
              onclick={() => markErstattet([claim.id])}
              title={iban
                ? undefined
                : 'Ohne IBAN nicht möglich — bitte zuerst eine IBAN hinterlegen'}
              class="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary-strong px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 md:ml-auto md:h-9 md:w-auto md:justify-start"
            >
              Als erstattet markieren
            </button>
          </div>
        </li>
      {/each}
    </ul>
    <div class="mt-4 flex justify-end">
      <button
        type="button"
        data-testid="mark-erstattet-alle"
        disabled={posting}
        onclick={() => markErstattet(data.claims.map((c) => c.id))}
        class="inline-flex h-11 items-center rounded-[10px] border border-(--hairline) bg-white px-4 text-sm font-medium text-primary-text disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) md:h-10"
      >
        Alle als erstattet markieren
      </button>
    </div>
  {/if}
</PageShell>
