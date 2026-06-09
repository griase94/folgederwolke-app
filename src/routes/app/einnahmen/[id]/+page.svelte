<script lang="ts">
  import { goto } from "$app/navigation";
  import LinkIcon from "@lucide/svelte/icons/link";
  import DetailModalShell from "$lib/components/admin/transactions/DetailModalShell.svelte";
  import BelegViewer from "$lib/components/files/BelegViewer.svelte";
  import EinnahmeDetailFields from "$lib/components/admin/transactions/einnahmen/EinnahmeDetailFields.svelte";
  import type { ActionData, PageData } from "./$types.js";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let dirty = $state(false);
  let saving = $state(false);

  // Per-field errors from a failed ?/save (mirrors Spenden) — surfaced inline in
  // the detail fields in addition to the toast that use:enhance already shows.
  const errors = $derived(
    (form as { errors?: Record<string, string[]> } | null)?.errors ?? {},
  );

  const detail = $derived(data.detail);
  const hasBeleg = $derived(!!detail.belegFileId);

  function close() {
    // eslint-disable-next-line svelte/no-navigation-without-resolve -- static parent-list route
    goto("/app/einnahmen");
  }
</script>

<svelte:head>
  <title>{detail.bezeichnung} – Einnahme</title>
</svelte:head>

{#snippet fields()}
  <EinnahmeDetailFields
    bezeichnung={detail.bezeichnung}
    betragCents={detail.betragCents}
    geldEingangDatum={detail.geldEingangDatum}
    kategorieNameSnapshot={detail.kategorieNameSnapshot}
    projectId={detail.projectId}
    kommentar={detail.kommentar}
    kategorien={data.kategorien}
    projects={data.projects}
    {errors}
    onDirty={() => (dirty = true)}
    onSaving={(v) => (saving = v)}
    onSaved={() => (dirty = false)}
  />
{/snippet}

{#snippet beleg()}
  {#if detail.belegFileId}
    <BelegViewer
      fileId={detail.belegFileId}
      mimeType={detail.belegMimeType ?? "application/octet-stream"}
      originalFilename={detail.belegOriginalName ?? "Beleg"}
      mode="inline"
    />
  {/if}
{/snippet}

<!-- workflowAction surfaces the "aus Rechnung FDW-…" context as a NAVIGABLE link
     when the income row was created by the markInvoiceAsPaid flow. It links to
     the Rechnung detail (/app/rechnungen/{rechnungId}, keyed on invoices.id)
     when the route id is projected; if only the business id is known it degrades
     to the Rechnungen overview. Renders nothing for free (unlinked) income. -->
{#snippet workflowAction()}
  {#if detail.rechnungBusinessId}
    {@const rechnungHref = detail.rechnungId
      ? `/app/rechnungen/${detail.rechnungId}`
      : "/app/rechnungen"}
    <!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic same-origin route, not a typed route id -->
    <a
      data-slot="aus-rechnung"
      href={rechnungHref}
      class="text-muted-foreground hover:text-foreground focus-visible:ring-ring mr-auto inline-flex items-center gap-1.5 rounded-md text-sm underline-offset-2 transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
      title={`aus Rechnung ${detail.rechnungBusinessId}`}
      aria-label={`Zur Rechnung ${detail.rechnungBusinessId}`}
    >
      <LinkIcon class="size-4" aria-hidden="true" />
      <span
        >aus Rechnung <span class="font-mono">{detail.rechnungBusinessId}</span
        ></span
      >
    </a>
  {/if}
{/snippet}

<DetailModalShell
  {detail}
  isFestgeschrieben={data.isFestgeschrieben}
  {fields}
  beleg={hasBeleg ? beleg : undefined}
  workflowAction={detail.rechnungBusinessId ? workflowAction : undefined}
  {saving}
  {dirty}
  onClose={close}
/>
