<script lang="ts">
  /**
   * /app/einnahmen/[id] — Einnahme detail (B3 Detail-Kette, detail-views-v4).
   *
   * Read-by-default full page. Einnahmen have no bezahlt-von / mark-paid /
   * duplicate — the only head action is the „aus Rechnung FDW-…" link when the
   * income row was created by the markInvoiceAsPaid flow. Edit reveals the
   * unchanged EinnahmeDetailFields ?/save form (id="detail-form").
   */
  import { page } from "$app/stores";
  import LinkIcon from "@lucide/svelte/icons/link";
  import TransactionDetailView from "$lib/components/admin/transactions/detail/TransactionDetailView.svelte";
  import FactsList from "$lib/components/admin/transactions/detail/FactsList.svelte";
  import KeyValue from "$lib/components/admin/transactions/detail/KeyValue.svelte";
  import BelegViewer from "$lib/components/files/BelegViewer.svelte";
  import EinnahmeDetailFields from "$lib/components/admin/transactions/einnahmen/EinnahmeDetailFields.svelte";
  import DeleteConfirm from "$lib/components/admin/transactions/detail/DeleteConfirm.svelte";
  import { SPHERE_LABELS, type Sphere } from "$lib/domain/sphere.js";
  import type { DetailStatusChip } from "$lib/components/admin/transactions/detail/DetailHead.svelte";
  import type { ActionData, PageData } from "./$types.js";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let dirty = $state(false);
  let saving = $state(false);
  let mode = $state<"read" | "edit">("read");
  let deleteOpen = $state(false);

  const errors = $derived(
    (form as { errors?: Record<string, string[]> } | null)?.errors ?? {},
  );

  const detail = $derived(data.detail);
  const hasBeleg = $derived(!!detail.belegFileId);

  function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const sphereEffective = $derived(detail.sphereEffective as Sphere);
  const projectName = $derived(
    data.projects.find((p) => p.id === detail.projectId)?.name ?? null,
  );

  const statusChip = $derived<DetailStatusChip>(
    data.isFestgeschrieben
      ? { label: "Festgeschrieben", tone: "neutral", icon: "lock" }
      : { label: "Verbucht", tone: "ok", icon: "check" },
  );

  const rechnungHref = $derived(
    detail.rechnungId ? `/app/rechnungen/${detail.rechnungId}` : "/app/rechnungen",
  );
</script>

<svelte:head>
  <title>{detail.bezeichnung} – Einnahmen – {$page.data.vereinName}</title>
</svelte:head>

{#snippet facts()}
  <FactsList>
    <KeyValue
      label="Geldeingang"
      value={fmtDate(detail.geldEingangDatum ?? detail.relevanzDatum)}
      tabular
    />
    <KeyValue
      label="Buchungsjahr"
      value={String(detail.yearOfBuchung ?? "—")}
      tabular
    />
    <KeyValue label="Kategorie" value={detail.kategorieNameSnapshot} />
    <KeyValue label="Sphäre" sub="aus Kategorie abgeleitet">
      <span
        class="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-[13px] font-medium text-ink-700"
      >
        <span
          class="size-2.5 rounded-[3px]"
          style="background: var(--sphere-{sphereEffective});"
          aria-hidden="true"
        ></span>
        {SPHERE_LABELS[sphereEffective]}
      </span>
    </KeyValue>
    {#if projectName}
      <KeyValue label="Projekt">
        <span
          class="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 text-[13px] font-medium text-ink-700"
        >
          <span
            class="size-2.5 rounded-[3px]"
            style="background: var(--type-einnahme);"
            aria-hidden="true"
          ></span>
          {projectName}
        </span>
      </KeyValue>
    {/if}
    <KeyValue
      label="Kommentar"
      value={detail.kommentar || "Kein Kommentar hinterlegt."}
      muted={!detail.kommentar}
      fullWidth={!!detail.kommentar}
    />
  </FactsList>
{/snippet}

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
    onSaved={() => {
      dirty = false;
      mode = "read";
    }}
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
  {:else}
    <p class="text-sm text-ink-500">Kein Beleg hinterlegt.</p>
  {/if}
{/snippet}

{#snippet headActions()}
  {#if detail.rechnungBusinessId}
    <!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic same-origin route -->
    <a
      data-slot="aus-rechnung"
      href={rechnungHref}
      class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted"
      title={`aus Rechnung ${detail.rechnungBusinessId}`}
    >
      <LinkIcon class="size-4 text-ink-500" aria-hidden="true" />
      <span>aus Rechnung <span class="font-mono">{detail.rechnungBusinessId}</span></span>
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {/if}
{/snippet}

<TransactionDetailView
  {detail}
  kind="income"
  locked={data.isFestgeschrieben}
  lock={data.isFestgeschrieben
    ? { variant: "festgeschrieben", year: detail.yearOfBuchung }
    : null}
  {statusChip}
  {facts}
  {fields}
  beleg={hasBeleg ? beleg : undefined}
  headActions={detail.rechnungBusinessId ? headActions : undefined}
  {saving}
  {dirty}
  bind:mode
  onDelete={() => (deleteOpen = true)}
  listHref="/app/einnahmen"
  listLabel="Einnahmen"
/>

<DeleteConfirm
  bind:open={deleteOpen}
  variant="simple"
  title="Einnahme löschen?"
  subtitle={`${detail.businessId} · ${detail.bezeichnung}`}
  reassurance="Diese Einnahme wird dauerhaft entfernt."
  confirmLabel="Löschen"
  onClose={() => (deleteOpen = false)}
/>
