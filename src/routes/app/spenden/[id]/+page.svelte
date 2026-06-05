<script lang="ts">
  import { goto } from "$app/navigation";
  import DetailModalShell from "$lib/components/admin/transactions/DetailModalShell.svelte";
  import SpendeDetailFields from "$lib/components/admin/transactions/spenden/SpendeDetailFields.svelte";
  import BelegViewer from "$lib/components/files/BelegViewer.svelte";
  import type { ActionData, PageData } from "./$types.js";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let dirty = $state(false);
  let saving = $state(false);

  const errors = $derived((form?.errors as Record<string, string[]>) ?? {});

  const detail = $derived(data.detail);
  const isSach = $derived(detail.spendeKind === "sachspende");
  // Bescheinigt OR festgeschrieben → read-only (shell hides Save). We feed the
  // shell `isFestgeschrieben` for either lock so the fields go inert + the
  // Speichern button is hidden once a Bescheinigung was issued, too.
  const issued = $derived(!!data.bescheinigungNr);
  const lockedReadOnly = $derived(data.isFestgeschrieben || issued);
  // The shell renders exactly ONE read-only notice (no local + shell double).
  // Festschreibung wins its default wording; a bescheinigt-not-festgeschrieben
  // Spende gets the Storno + Neu-Erfassung variant.
  const lockNotice = $derived(
    data.isFestgeschrieben
      ? "Korrektur nur über Storno (Phase 2)"
      : "Bescheinigt — Storno + Neu-Erfassung (Phase 2)",
  );

  const bescheinigungHref = $derived(
    `/app/spenden/${detail.id}/zuwendungsbestaetigung`,
  );

  function close() {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- static app route
    goto("/app/spenden");
  }
</script>

<svelte:head>
  <title>{detail.bezeichnung} – Spenden</title>
</svelte:head>

{#snippet fields()}
  <SpendeDetailFields
    {detail}
    {errors}
    onDirty={() => (dirty = true)}
    onSaving={(v) => (saving = v)}
  />
  {#if form?.error}
    <p class="mt-3 text-sm text-red-600" data-testid="save-error">
      {form.error}
    </p>
  {/if}
{/snippet}

{#snippet beleg()}
  {#if detail.belegFileId}
    <div class="mb-3">
      <p class="text-muted-foreground mb-1 text-xs font-medium">
        Beleg / Kontoauszug
      </p>
      <BelegViewer
        fileId={detail.belegFileId}
        mimeType={detail.belegMimeType ?? "application/octet-stream"}
        originalFilename={detail.belegOriginalName ?? "Beleg"}
      />
    </div>
  {/if}
  {#if isSach && detail.herkunftsbelegFileId}
    <div>
      <p class="text-muted-foreground mb-1 text-xs font-medium">
        Herkunftsbeleg
      </p>
      <!-- getTransactionDetail now resolves the Herkunftsbeleg's real mime/name
			     via a second files join, so the viewer renders the correct type +
			     filename (was hardcoded application/octet-stream / "Herkunftsbeleg"). -->
      <BelegViewer
        fileId={detail.herkunftsbelegFileId}
        mimeType={detail.herkunftsbelegMimeType ?? "application/octet-stream"}
        originalFilename={detail.herkunftsbelegOriginalName ?? "Herkunftsbeleg"}
      />
    </div>
  {/if}
{/snippet}

{#snippet workflowAction()}
  {#if issued}
    <span
      class="text-muted-foreground text-sm"
      data-testid="bescheinigung-nr-display"
    >
      Bescheinigung <strong>{data.bescheinigungNr}</strong>
    </span>
    <!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic same-origin app route -->
    <a
      href={bescheinigungHref}
      data-testid="bescheinigung-view"
      class="border-border bg-background hover:bg-accent inline-flex h-11 min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium"
    >
      Bescheinigung anzeigen
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {:else if data.bescheinigungEnabled}
    <!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic same-origin app route -->
    <a
      href={bescheinigungHref}
      data-testid="bescheinigung-erstellen"
      class="border-primary bg-background text-primary hover:bg-primary/10 inline-flex h-11 min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium"
    >
      Bescheinigung erstellen
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {:else}
    <span
      data-testid="bescheinigung-disabled"
      title="Freistellungsbescheid fehlt in den Einstellungen"
      class="border-border bg-muted text-muted-foreground/60 inline-flex h-11 min-h-11 cursor-not-allowed items-center justify-center rounded-md border px-4 text-sm font-medium"
    >
      Bescheinigung erstellen
    </span>
  {/if}
{/snippet}

<div class="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
  <DetailModalShell
    {detail}
    isFestgeschrieben={lockedReadOnly}
    {lockNotice}
    {fields}
    {beleg}
    {workflowAction}
    {saving}
    {dirty}
    onClose={close}
  />
</div>
