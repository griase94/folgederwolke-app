<script lang="ts">
	import { page } from '$app/state';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();

  const STEPS = [
    { key: 'eingegangen', label: 'Eingegangen', description: 'Wir haben deine Einreichung erhalten.' },
    { key: 'in_pruefung', label: 'In Prüfung', description: 'Die Einreichung wird geprüft.' },
    { key: 'geprueft', label: 'Geprüft', description: 'Die Prüfung ist abgeschlossen.' },
    { key: 'erstattet', label: 'Erstattet', description: 'Der Betrag wurde überwiesen.' },
  ] as const;

  const ABGELEHNT_STEP = {
    key: 'abgelehnt',
    label: 'Abgelehnt',
    description: 'Die Einreichung wurde leider abgelehnt.',
  };

  type StepKey = (typeof STEPS)[number]['key'];

  const STATUS_ORDER: Record<string, number> = {
    eingegangen: 0,
    in_pruefung: 1,
    geprueft: 2,
    erstattet: 3,
    abgelehnt: 2, // branch-off after "geprüft" position
  };

  const currentIndex = $derived(STATUS_ORDER[data.status] ?? 0);
  const isAbgelehnt = $derived(data.status === 'abgelehnt');

  function formatDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function formatBetrag(cents: number, currency: string): string {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }

  function isStepDone(stepKey: StepKey): boolean {
    const stepIndex = STATUS_ORDER[stepKey] ?? 0;
    return stepIndex < currentIndex || (stepIndex === currentIndex && !isAbgelehnt);
  }

  function isStepActive(stepKey: StepKey): boolean {
    return data.status === stepKey;
  }
</script>

<svelte:head>
  <title>Status {data.ausId} – {page.data.vereinName}</title>
</svelte:head>

<main class="container mx-auto max-w-2xl px-6 py-12">
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a href="/auslage-einreichen" class="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-1 text-sm transition-colors">
    ← Neue Einreichung
  </a>

  <h1 class="text-foreground mb-2 text-2xl font-bold tracking-tight">
    Einreichungs-Status
  </h1>
  <p class="font-mono text-muted-foreground mb-8 text-lg">{data.ausId}</p>

  <!-- Summary card -->
  <div class="bg-card border rounded-lg p-5 mb-8 space-y-3">
    <div class="flex justify-between items-start gap-4">
      <div>
        <p class="text-sm text-muted-foreground font-medium">Bezeichnung</p>
        <p class="font-medium">{data.bezeichnung}</p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-sm text-muted-foreground font-medium">Betrag</p>
        <p class="font-semibold">{formatBetrag(data.betragCents, data.currency)}</p>
      </div>
    </div>
    <div class="flex justify-between items-start gap-4">
      <div>
        <p class="text-sm text-muted-foreground font-medium">Eingereicht am</p>
        <p>{formatDate(data.submittedAt)}</p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-sm text-muted-foreground font-medium">Bezahlt von</p>
        <p>{data.bezahltVonDisplay}</p>
      </div>
    </div>
    {#if data.maskedIban}
      <div>
        <p class="text-sm text-muted-foreground font-medium">IBAN (maskiert)</p>
        <p class="font-mono text-sm">{data.maskedIban}</p>
      </div>
    {/if}
  </div>

  <!-- Timeline -->
  <div class="space-y-0">
    {#each STEPS as step, i (step.key)}
      {@const done = isStepDone(step.key)}
      {@const active = isStepActive(step.key)}
      {@const last = i === STEPS.length - 1}

      <div class="flex gap-4">
        <!-- Connector column -->
        <div class="flex flex-col items-center">
          <div
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors {done
              ? 'border-green-500 bg-green-500 text-white'
              : active
                ? 'border-primary-strong bg-primary-strong text-primary-foreground'
                : 'border-muted-foreground/30 bg-background text-muted-foreground/50'}"
            aria-current={active ? 'step' : undefined}
          >
            {#if done && !active}
              ✓
            {:else}
              {i + 1}
            {/if}
          </div>
          {#if !last}
            <div class="w-0.5 flex-1 my-1 {done ? 'bg-green-500' : 'bg-muted-foreground/20'}"></div>
          {/if}
        </div>

        <!-- Content -->
        <div class="pb-6 pt-1 {last ? 'pb-0' : ''}">
          <p class="font-medium leading-tight {done || active ? 'text-foreground' : 'text-muted-foreground/60'}">
            {step.label}
          </p>
          {#if done || active}
            <p class="text-muted-foreground mt-0.5 text-sm">{step.description}</p>
            {#if step.key === 'eingegangen' && data.submittedAt}
              <p class="text-muted-foreground mt-0.5 text-xs">{formatDate(data.submittedAt)}</p>
            {/if}
            {#if (step.key === 'geprueft' || step.key === 'erstattet') && data.decidedAt}
              <p class="text-muted-foreground mt-0.5 text-xs">{formatDate(data.decidedAt)}</p>
            {/if}
          {/if}
        </div>
      </div>
    {/each}

    <!-- Abgelehnt branch (only shown when rejected) -->
    {#if isAbgelehnt}
      <div class="flex gap-4 mt-2">
        <div class="flex flex-col items-center">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-destructive bg-destructive text-destructive-foreground text-sm font-bold">
            ✕
          </div>
        </div>
        <div class="pt-1">
          <p class="font-medium text-destructive">{ABGELEHNT_STEP.label}</p>
          <p class="text-muted-foreground mt-0.5 text-sm">{ABGELEHNT_STEP.description}</p>
          {#if data.decidedAt}
            <p class="text-muted-foreground mt-0.5 text-xs">{formatDate(data.decidedAt)}</p>
          {/if}
        </div>
      </div>
    {/if}
  </div>

  <div class="mt-10 border-t pt-8">
    <p class="text-muted-foreground text-sm">
      Fragen? Schreib uns und nenne deine Einreichungs-ID
      <span class="font-mono font-medium">{data.ausId}</span>.
    </p>
  </div>
</main>
