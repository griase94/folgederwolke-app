<script lang="ts">
  /**
   * Überweisungs-Werkstatt (Aurora A-flow S3.2) — ONE screen, two lenses.
   *
   * "Vorzubereiten" is the overview: what is outstanding, who is blocked.
   * "Auf der Liste" is the bank tool: one card per claim with the copy fields
   * in the bank's own field order. Both lenses read the SAME load — they are
   * views, not states, so switching never costs a round trip.
   *
   * §7 is now enforced by the server (S3.0), so the UI stops offering what the
   * server would refuse: a claim without a payout IBAN has no commit button at
   * all and says where the IBAN can be added instead. The old "mark it anyway,
   * it might have been cash" path is gone — it produced reimbursements nobody
   * could trace to a transfer.
   */
  import { tick } from 'svelte';
  import { page } from '$app/state';
  import { replaceState, invalidateAll } from '$app/navigation';
  import PageShell from '$lib/components/layout/PageShell.svelte';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import DateField from '$lib/components/ui/date-field/DateField.svelte';
  import { Button } from '$lib/components/ui/button/index.js';
  import { SegmentedControl } from '$lib/components/ui/segmented-control/index.js';
  import { CopyAnnouncer } from '$lib/components/ui/copy-field/index.js';
  import MoneyStrip from '$lib/components/ui/MoneyStrip.svelte';
  import ProblemFlag from '$lib/components/ui/ProblemFlag.svelte';
  import LockChip from '$lib/components/ui/LockChip.svelte';
  import ErstattungClaimCard from '$lib/components/admin/erstattung/ErstattungClaimCard.svelte';
  import { buildBulkResult } from '$lib/components/admin/erstattung/bulk-result.js';
  import { formatMoney } from '$lib/components/ui/money/money.svelte';
  import { berlinYmd } from '$lib/domain/year.js';
  import { deserialize } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import type { ActionResult } from '@sveltejs/kit';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();

  // Europe/Berlin today (ADR-0001): a UTC slice is the wrong day for an hour or
  // two around midnight, and this date lands in the books.
  let chosenDate = $state(berlinYmd());
  let zahlungsartId = $state('');
  $effect(() => {
    if (!zahlungsartId && data.zahlungsarten.length > 0) {
      zahlungsartId = data.zahlungsarten[0]!.id;
    }
  });

  // The lens lives in the URL so a reload or a shared link keeps the view.
  const lens = $derived(
    page.url.searchParams.get('lens') === 'liste' ? 'liste' : 'vorbereiten'
  );
  function setLens(next: string) {
    const url = new URL(page.url);
    url.searchParams.set('lens', next);
    // Same route, only a query param — replaceState keeps the Back button
    // meaning "leave the Werkstatt" instead of "undo my last lens toggle".
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- same-route query update
    replaceState(url, {});
  }

  const payable = $derived(data.claims.filter((c) => c.payoutIban !== null));

  let announcer = $state<{ announce: (l: string) => void } | null>(null);
  function onCopied(label: string) {
    announcer?.announce(label);
  }
  function onCopyError() {
    toast.error('Kopieren fehlgeschlagen');
  }

  // Focus lands here once the last claim is committed, so keyboard and screen
  // reader users are not dropped at the top of an empty page.
  let emptyEl = $state<HTMLParagraphElement | null>(null);

  let posting = $state(false);
  async function markErstattet(ids: string[]) {
    if (ids.length === 0) return;
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
        const summary = result.data.summary as Parameters<typeof buildBulkResult>[0];
        const r = buildBulkResult(summary);
        // Always the itemised tally: a batch where two claims were skipped is
        // not a success, and the admin has to see WHICH ones.
        const body = r.tally.join(' · ');
        if (r.tone === 'ok') toast.success(r.headline, { description: body });
        else toast.warning(r.headline, { description: body });
        await invalidateAll();
        await tick();
        emptyEl?.focus();
      } else if (result.type === 'failure') {
        toast.error((result.data?.error as string) ?? 'Aktion fehlgeschlagen');
      }
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      posting = false;
    }
  }

  const chips = $derived([
    { label: 'Erstattungen', count: data.claims.length, testId: 'chip-erstattungen' },
    ...(data.countIbanFehlt > 0
      ? [
          {
            label: 'IBAN fehlt',
            count: data.countIbanFehlt,
            tone: 'crit' as const,
            testId: 'chip-iban-fehlt'
          }
        ]
      : [])
  ]);
</script>

<svelte:head>
  <title>Überweisungs-Werkstatt – {page.data.vereinName}</title>
</svelte:head>

{#snippet commitButton(id: string)}
  <Button
    size="cta"
    variant="outline"
    data-testid="mark-erstattet"
    disabled={posting}
    onclick={() => markErstattet([id])}
    class="border-type-einnahme/40 text-type-einnahme hover:bg-type-einnahme-tint"
  >
    Als erstattet markieren
  </Button>
{/snippet}

<!-- `list` (1100) + `rail`: a claim list wants a reading width, not a canvas —
     1100 minus the 320 cockpit still leaves ~750 for the cards, while `wide`
     (1680, shipped with #170) would stretch a bank-order card to ~1330px and
     pull the Empfängername away from the IBAN it belongs to. `rail` only
     relaxes the cap from 2240px up, where a 1100px channel in a 2560px window
     otherwise strands 610px of empty plain on each side (Andys Regel 6). -->
<PageShell width="list" rail>
  <PageHeader title="Überweisungs-Werkstatt" backHref="/app/ausgaben" backLabel="Ausgaben">
    {#snippet meta()}
      <span class="text-sm text-ink-500" data-testid="werkstatt-meta">
        {data.claims.length === 1
          ? '1 freigegebene Erstattung'
          : `${data.claims.length} freigegebene Erstattungen`}
        · Gesamt
        <b class="font-semibold tabular-nums text-type-ausgabe">{formatMoney(data.gesamtCents)}</b>
        zu überweisen
      </span>
    {/snippet}
  </PageHeader>

  <CopyAnnouncer bind:this={announcer} />

  {#if data.claims.length === 0}
    <p
      bind:this={emptyEl}
      tabindex="-1"
      data-testid="werkstatt-empty"
      class="mt-8 rounded-2xl border border-hairline bg-muted/20 p-8 text-center text-sm text-ink-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <b class="block text-base font-semibold text-ink-900">Alles überwiesen</b>
      Keine freigegebenen Erstattungen offen. Sobald eine Auslage freigegeben wird, wartet sie hier
      auf die Überweisung.
    </p>
  {:else}
    <div class="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
      <div class="min-w-0 flex-1">
        <SegmentedControl
          variant="lens"
          ariaLabel="Ansicht"
          value={lens}
          onChange={setLens}
          class="w-full sm:w-auto"
          options={[
            { value: 'vorbereiten', label: `Vorzubereiten · ${data.claims.length}` },
            { value: 'liste', label: `Auf der Liste · ${data.claims.length}` }
          ]}
        />

        {#if lens === 'vorbereiten'}
          <MoneyStrip
            class="mt-4 lg:hidden"
            eyebrow="Offen · wartet auf Überweisung"
            totalCents={data.gesamtCents}
            {chips}
          />

          <ul
            class="mt-4 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card"
            data-testid="prep-list"
          >
            {#each data.claims as claim (claim.id)}
              <li class="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="prep-row">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-ink-900">{claim.empfaenger}</p>
                  <p class="flex items-center gap-1.5 truncate text-xs text-ink-500">
                    <span class="tabular-nums">{claim.ausNr ?? claim.businessId}</span>
                    · <span class="truncate">{claim.bezeichnung}</span>
                    {#if claim.festgeschrieben}
                      <!-- F4: the whole point is that a closed-year claim is
                           VISIBLE. Without a marker here the admin would only
                           learn about it after switching lenses. -->
                      <span class="shrink-0" data-testid="prep-festgeschrieben"><LockChip /></span>
                    {/if}
                  </p>
                </div>
                <span class="shrink-0 text-sm font-semibold tabular-nums text-type-ausgabe">
                  {formatMoney(claim.betragCents)}
                </span>
                <!-- Fixed slot widths so the status column stays a ruler and
                     rows do not jitter between "wartet" and the flag. -->
                <span class="flex w-[168px] justify-end">
                  {#if claim.payoutIban}
                    <span
                      class="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium text-ink-700"
                    >
                      wartet
                    </span>
                  {:else}
                    <ProblemFlag href={claim.ibanFixHref} data-testid="prep-iban-fehlt">
                      IBAN fehlt
                    </ProblemFlag>
                  {/if}
                </span>
                <span class="flex w-[190px] justify-end">
                  {#if claim.payoutIban}{@render commitButton(claim.id)}{/if}
                </span>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="mt-4 flex flex-col gap-3" data-testid="claim-list">
            {#each data.claims as claim (claim.id)}
              <ErstattungClaimCard {claim} {onCopied} {onCopyError}>
                {#snippet commit()}{@render commitButton(claim.id)}{/snippet}
              </ErstattungClaimCard>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Rail: the batch cockpit. Uses the width instead of leaving it empty
           (Andy Rule 6); collapses under the list on narrow screens. -->
      <aside class="w-full shrink-0 lg:sticky lg:top-6 lg:w-[320px]" data-testid="werkstatt-rail">
        <MoneyStrip
          class="hidden lg:block"
          eyebrow="Offen · wartet auf Überweisung"
          totalCents={data.gesamtCents}
          {chips}
        />

        <div class="mt-4 rounded-2xl border border-hairline bg-card p-4">
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-ink-900" for="ueberweisung-datum">
                Überweisungsdatum
              </label>
              <DateField
                id="ueberweisung-datum"
                name="chosenDate"
                value={chosenDate}
                onchange={(iso) => (chosenDate = iso)}
                required
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-ink-900" for="ueberweisung-zahlungsart">
                Zahlungsart
              </label>
              <!-- min-w by the longest option ("Überweisung (SEPA)") so it never
                   truncates (Abnahme #4). -->
              <select
                id="ueberweisung-zahlungsart"
                bind:value={zahlungsartId}
                class="h-11 min-w-[22ch] rounded-[10px] border border-hairline bg-card px-3 text-base sm:text-sm md:h-10"
              >
                {#each data.zahlungsarten as za (za.id)}
                  <option value={za.id}>{za.label}</option>
                {/each}
              </select>
            </div>

            <Button
              size="cta"
              variant="outline"
              class="w-full"
              data-testid="mark-erstattet-alle"
              disabled={posting || payable.length === 0}
              onclick={() => markErstattet(payable.map((c) => c.id))}
            >
              Alle als erstattet markieren
            </Button>
            <p class="text-xs leading-snug text-ink-500">
              Setzt Datum &amp; Zahlungsart für alle Erstattungen mit IBAN.
              {#if data.countIbanFehlt > 0}
                <b class="font-semibold">{data.countIbanFehlt}</b>
                ohne IBAN {data.countIbanFehlt === 1 ? 'wird' : 'werden'} übersprungen.
              {/if}
            </p>
          </div>
        </div>
      </aside>
    </div>
  {/if}
</PageShell>
