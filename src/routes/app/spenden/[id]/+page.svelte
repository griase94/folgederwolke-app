<script lang="ts">
  /**
   * /app/spenden/[id] — Spende detail (B3 Detail-Kette, detail-views-v4).
   *
   * Read-by-default full page. The rail carries the Zuwendungsbestätigung card
   * (not issued → „Zur Bescheinigung" link; issued → Nr. + PDF + read-only lock).
   * A bescheinigt OR festgeschrieben Spende is read-only — the SINGLE `locked`
   * flag drives inert fields + no Save + no edit (contract risk H1); editSpende
   * re-guards with a 409 server-side.
   */
  import { page } from "$app/stores";
  import FileCheck from "@lucide/svelte/icons/file-check";
  import Download from "@lucide/svelte/icons/download";
  import Lock from "@lucide/svelte/icons/lock";
  import TransactionDetailView from "$lib/components/admin/transactions/detail/TransactionDetailView.svelte";
  import DetailCard from "$lib/components/admin/transactions/detail/DetailCard.svelte";
  import FactsList from "$lib/components/admin/transactions/detail/FactsList.svelte";
  import KeyValue from "$lib/components/admin/transactions/detail/KeyValue.svelte";
  import BelegViewer from "$lib/components/files/BelegViewer.svelte";
  import SpendeDetailFields from "$lib/components/admin/transactions/spenden/SpendeDetailFields.svelte";
  import DeleteConfirm from "$lib/components/admin/transactions/detail/DeleteConfirm.svelte";
  import { SPHERE_LABELS, type Sphere } from "$lib/domain/sphere.js";
  import type { DetailStatusChip } from "$lib/components/admin/transactions/detail/DetailHead.svelte";
  import type { ActionData, PageData } from "./$types.js";

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let dirty = $state(false);
  let saving = $state(false);
  let mode = $state<"read" | "edit">("read");
  let deleteOpen = $state(false);

  const errors = $derived((form?.errors as Record<string, string[]>) ?? {});
  const detail = $derived(data.detail);
  const isSach = $derived(detail.spendeKind === "sachspende");
  const issued = $derived(!!data.bescheinigungNr);
  const lockedReadOnly = $derived(data.isFestgeschrieben || issued);

  function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const sphereEffective = $derived(detail.sphereEffective as Sphere);
  const spendeartLabel = $derived(
    detail.spendeKind === "sachspende" ? "Sachspende" : "Geldspende",
  );
  const zweckgebunden = $derived(
    detail.zweckbindungKind === "zweckgebunden",
  );

  const statusChip = $derived<DetailStatusChip>(
    data.isFestgeschrieben
      ? { label: "Festgeschrieben", tone: "neutral", icon: "lock" }
      : issued
        ? { label: "Bescheinigt", tone: "neutral", icon: "lock" }
        : { label: "Verbucht", tone: "ok", icon: "check" },
  );

  const bescheinigungHref = $derived(
    `/app/spenden/${detail.id}/zuwendungsbestaetigung`,
  );
  const bescheinigungPdfHref = $derived(
    `/app/spenden/${detail.id}/zuwendungsbestaetigung/pdf`,
  );
</script>

<svelte:head>
  <title>{detail.bezeichnung} – Spenden – {$page.data.vereinName}</title>
</svelte:head>

{#snippet facts()}
  <FactsList lblWidth="150px">
    <KeyValue label="Zugewendet am" value={fmtDate(detail.relevanzDatum)} tabular />
    <KeyValue
      label="Buchungsjahr"
      value={String(detail.yearOfBuchung ?? "—")}
      tabular
    />
    <KeyValue label="Spendenart" value={spendeartLabel} />
    {#if zweckgebunden}
      <KeyValue
        label="Zweckbindung"
        value={detail.zweckbindungText || "Zweckgebunden"}
        sub={detail.zweckbindungText ? "zweckgebunden" : undefined}
      />
    {:else}
      <KeyValue label="Zweckbindung" value="Zweckfrei" />
    {/if}
    <KeyValue label="Kategorie" value={detail.kategorieNameSnapshot} />
    <KeyValue label="Sphäre" sub="aus Spendenart abgeleitet">
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
    <KeyValue
      label="Spender:in"
      value={detail.spenderName ?? "—"}
      sub={detail.spenderAdresse ?? undefined}
    />
    <KeyValue
      label="Kommentar"
      value={detail.kommentar || "Kein Kommentar hinterlegt."}
      muted={!detail.kommentar}
      fullWidth={!!detail.kommentar}
    />
  </FactsList>
{/snippet}

{#snippet fields()}
  <SpendeDetailFields
    {detail}
    {errors}
    onDirty={() => (dirty = true)}
    onSaving={(v) => (saving = v)}
    onSaved={() => {
      dirty = false;
      mode = "read";
    }}
  />
  {#if form?.error}
    <p class="mt-3 text-sm text-[color:var(--sev-critical-text)]" data-testid="save-error">
      {form.error}
    </p>
  {/if}
{/snippet}

{#snippet beleg()}
  {#if detail.belegFileId}
    <div class="mb-3">
      <p class="mb-1 text-xs font-medium text-ink-500">Beleg / Kontoauszug</p>
      <BelegViewer
        fileId={detail.belegFileId}
        mimeType={detail.belegMimeType ?? "application/octet-stream"}
        originalFilename={detail.belegOriginalName ?? "Beleg"}
      />
    </div>
  {/if}
  {#if isSach && detail.herkunftsbelegFileId}
    <div>
      <p class="mb-1 text-xs font-medium text-ink-500">Herkunftsbeleg</p>
      <BelegViewer
        fileId={detail.herkunftsbelegFileId}
        mimeType={detail.herkunftsbelegMimeType ?? "application/octet-stream"}
        originalFilename={detail.herkunftsbelegOriginalName ?? "Herkunftsbeleg"}
      />
    </div>
  {/if}
  {#if !detail.belegFileId && !(isSach && detail.herkunftsbelegFileId)}
    <p class="text-sm text-ink-500">Kein Beleg hinterlegt.</p>
  {/if}
{/snippet}

{#snippet railExtra()}
  <DetailCard heading="Zuwendungsbestätigung">
    {#snippet icon()}<FileCheck class="size-[15px]" />{/snippet}
    {#if issued}
      <div class="flex flex-col gap-3">
        <div>
          <div
            class="text-lg font-extrabold tabular-nums text-ink-900"
            data-testid="bescheinigung-nr-display"
          >
            {data.bescheinigungNr}
          </div>
          <div class="text-[12.5px] text-ink-500">
            {detail.bescheinigungDatum
              ? `ausgestellt am ${fmtDate(detail.bescheinigungDatum)}`
              : "Zuwendungsbestätigung ausgestellt"}
          </div>
        </div>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic app route -->
        <a
          href={bescheinigungPdfHref}
          data-testid="bescheinigung-view"
          class="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted"
        >
          <Download class="size-4" aria-hidden="true" />PDF herunterladen
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
        <div
          class="flex items-start gap-2 rounded-lg border border-[color:var(--sev-info)]/30 bg-[color:var(--sev-info)]/10 px-3 py-2.5 text-[13px] text-ink-700"
        >
          <Lock class="mt-0.5 size-4 shrink-0 text-[color:var(--sev-info)]" aria-hidden="true" />
          <span>Bescheinigt — Korrektur nur über Storno &amp; Neu-Erfassung.</span>
        </div>
      </div>
    {:else if data.bescheinigungEnabled}
      <div class="flex flex-col gap-3">
        <p class="text-[13px] leading-snug text-ink-700">
          Noch nicht ausgestellt. Name &amp; Anschrift liegen vor — du kannst die
          Bescheinigung ausstellen.
        </p>
        <!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic app route -->
        <a
          href={bescheinigungHref}
          data-testid="bescheinigung-erstellen"
          class="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white"
          style="background: var(--type-spende);"
        >
          <FileCheck class="size-4" aria-hidden="true" />Zur Bescheinigung
        </a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
      </div>
    {:else}
      <div class="flex flex-col gap-3">
        <p class="text-[13px] leading-snug text-ink-700">
          Zum Ausstellen fehlt der Freistellungsbescheid in den Einstellungen.
        </p>
        <button
          type="button"
          disabled
          aria-disabled="true"
          data-testid="bescheinigung-disabled"
          aria-label="Bescheinigung erstellen (Freistellungsbescheid fehlt in den Einstellungen)"
          class="inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 text-sm font-semibold text-ink-500/60"
        >
          <FileCheck class="size-4" aria-hidden="true" />Zur Bescheinigung
        </button>
      </div>
    {/if}
  </DetailCard>
{/snippet}

<TransactionDetailView
  {detail}
  kind="donation"
  locked={lockedReadOnly}
  lock={data.isFestgeschrieben
    ? { variant: "festgeschrieben", year: detail.yearOfBuchung }
    : issued
      ? { variant: "bescheinigt", bescheinigungNr: data.bescheinigungNr }
      : null}
  {statusChip}
  {facts}
  {fields}
  {beleg}
  documented={!!detail.belegFileId ||
    (isSach && !!detail.herkunftsbelegFileId)}
  {railExtra}
  {saving}
  {dirty}
  bind:mode
  onDelete={() => (deleteOpen = true)}
  listHref="/app/spenden"
  listLabel="Spenden"
/>

<DeleteConfirm
  bind:open={deleteOpen}
  variant="simple"
  title="Spende löschen?"
  subtitle={`${detail.businessId} · ${detail.bezeichnung}`}
  reassurance="Noch nicht bescheinigt — diese Spende lässt sich löschen."
  confirmLabel="Löschen"
  onClose={() => (deleteOpen = false)}
/>
