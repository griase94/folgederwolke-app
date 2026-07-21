<script lang="ts">
  /**
   * /app/ausgaben/[id] — Ausgabe detail (B3 Detail-Kette, detail-views-v4).
   *
   * Read-by-default full page: money-first head, Details facts, rail (Beleg ·
   * Verlauf · GoBD). „Bearbeiten" reveals the AusgabeDetailFields form (the
   * unchanged ?/save contract, id="detail-form"); the shell owns the mode, the
   * dirty-guard and the typed Speichern. Read-mode head actions: „Als bezahlt
   * markieren" (?/mark-paid, no-mail, only while open) + „Als Vorlage" (?/duplicate
   * → prefill /app/ausgaben/neu).
   */
  import { applyAction, enhance } from "$app/forms";
  import { page } from "$app/stores";
  import { goto, invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import Check from "@lucide/svelte/icons/check";
  import FileText from "@lucide/svelte/icons/file-text";
  import TransactionDetailView from "$lib/components/admin/transactions/detail/TransactionDetailView.svelte";
  import FactsList from "$lib/components/admin/transactions/detail/FactsList.svelte";
  import KeyValue from "$lib/components/admin/transactions/detail/KeyValue.svelte";
  import BelegViewer from "$lib/components/files/BelegViewer.svelte";
  import AusgabeDetailFields from "$lib/components/admin/transactions/ausgaben/AusgabeDetailFields.svelte";
  import DeleteConfirm from "$lib/components/admin/transactions/detail/DeleteConfirm.svelte";
  import { statusPresentation } from "$lib/domain/transaction-status.js";
  import { SPHERE_LABELS, type Sphere } from "$lib/domain/sphere.js";
  import { formatCentsAsEuro } from "$lib/domain/money.js";
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

  function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const sphereEffective = $derived(detail.sphereEffective as Sphere);
  // ADR-0008: an override means the effective sphere diverged from the
  // Kategorie-derived snapshot (project sphere override).
  const sphereIsOverride = $derived(
    detail.sphereEffective !== detail.sphereSnapshot,
  );
  const projectName = $derived(
    data.projects.find((p) => p.id === detail.projectId)?.name ?? null,
  );
  const payerSub = $derived(
    detail.bezahltVonMemberId
      ? "Mitglied · hat ausgelegt"
      : detail.externName
        ? "Externe Person · hat ausgelegt"
        : "Vereinskonto",
  );

  const isErstattet = $derived(detail.erstattetAm !== null);
  // Ausgabe workflow states are NEUTRAL in the detail head (ANDY-LENS §4: green
  // is only the fresh-confirmed moment, never a pending „Zu prüfen").
  const statusChip = $derived<DetailStatusChip>(
    data.isFestgeschrieben
      ? { label: "Festgeschrieben", tone: "neutral", icon: "lock" }
      : isErstattet
        ? { label: "Erstattet", tone: "neutral", icon: "refresh" }
        : { label: statusPresentation(detail.status ?? "").label, tone: "neutral" },
  );
  const headMeta = $derived(
    isErstattet
      ? `erstattet am ${fmtDate(detail.erstattetAm)} an ${detail.bezahltVonDisplay ?? "Unbekannt"}`
      : undefined,
  );

  const today = new Date().toISOString().slice(0, 10);
  let markPaidDatum = $state(today);
  let markPaidZahlartId = $state("");

  const canMarkPaid = $derived(
    !data.isFestgeschrieben &&
      detail.approvedAt !== null &&
      detail.erstattetAm === null,
  );

  function buildPrefillQuery(prefill: Record<string, unknown>): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- one-shot URL builder
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(prefill)) {
      if (v !== null && v !== undefined && v !== "") params.set(k, String(v));
    }
    return params.toString();
  }
</script>

<svelte:head>
  <title>{detail.bezeichnung} – Ausgaben – {$page.data.vereinName}</title>
</svelte:head>

{#snippet facts()}
  <FactsList>
    <KeyValue
      label="Datum"
      value={fmtDate(detail.rechnungsdatum ?? detail.relevanzDatum)}
      tabular
    />
    <KeyValue
      label="Buchungsjahr"
      value={String(detail.yearOfBuchung ?? "—")}
      tabular
    />
    <KeyValue label="Kategorie" value={detail.kategorieNameSnapshot} />
    <KeyValue
      label="Sphäre"
      sub={sphereIsOverride
        ? "Projekt-Sphäre (Override)"
        : "aus Kategorie abgeleitet"}
    >
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
            style="background: var(--type-ausgabe);"
            aria-hidden="true"
          ></span>
          {projectName}
        </span>
      </KeyValue>
    {/if}
    <KeyValue
      label="Bezahlt von"
      value={detail.bezahltVonDisplay ?? "—"}
      sub={payerSub}
    />
    {#if isErstattet}
      <KeyValue
        label="Erstattung"
        value={formatCentsAsEuro(BigInt(Math.abs(detail.betragCents)))}
        sub="überwiesen · abgeschlossen"
        tabular
      />
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
  <AusgabeDetailFields
    {detail}
    expenseKategorien={data.expenseKategorien}
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
  <!-- duplicate-as-template (always available) -->
  <form
    method="POST"
    action="?/duplicate"
    use:enhance={() => {
      return async ({ result }) => {
        if (result.type === "success" && result.data) {
          const prefill = (result.data as { prefill?: Record<string, unknown> })
            .prefill;
          if (prefill) {
            const qs = buildPrefillQuery(prefill);
            // eslint-disable-next-line svelte/no-navigation-without-resolve
            goto(`/app/ausgaben/neu${qs ? `?${qs}` : ""}`);
            return;
          }
        }
        if (result.type === "failure") {
          const err = (result.data as { error?: string } | undefined)?.error;
          toast.error(err ?? "Duplizieren fehlgeschlagen");
        }
        await applyAction(result);
      };
    }}
  >
    <button
      type="submit"
      class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted"
    >
      <FileText class="size-4 text-ink-500" aria-hidden="true" />Als Vorlage
    </button>
  </form>

  {#if canMarkPaid}
    <form
      method="POST"
      action="?/mark-paid"
      use:enhance={() => {
        saving = true;
        return async ({ result }) => {
          saving = false;
          if (result.type === "failure") {
            const err = (result.data as { error?: string } | undefined)?.error;
            toast.error(err ?? "Als bezahlt markieren fehlgeschlagen");
          }
          await applyAction(result);
          if (result.type === "success") await invalidateAll();
        };
      }}
      class="flex flex-wrap items-center gap-2"
    >
      <input
        type="date"
        name="datum"
        lang="de"
        bind:value={markPaidDatum}
        required
        class="h-9 rounded-lg border border-border bg-card px-2 text-sm"
      />
      <select
        name="zahlartId"
        bind:value={markPaidZahlartId}
        class="h-9 rounded-lg border border-border bg-card px-2 text-sm"
      >
        <option value="">— Zahlungsart —</option>
        {#each data.zahlungsarten as z (z.id)}
          <option value={z.id}>{z.label}</option>
        {/each}
      </select>
      <button
        type="submit"
        class="inline-flex h-9 items-center gap-2 rounded-lg bg-[color:var(--type-einnahme)] px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Check class="size-4" aria-hidden="true" />Als bezahlt markieren
      </button>
    </form>
  {/if}
{/snippet}

<TransactionDetailView
  {detail}
  kind="expense"
  locked={data.isFestgeschrieben}
  lock={data.isFestgeschrieben
    ? { variant: "festgeschrieben", year: detail.yearOfBuchung }
    : null}
  {statusChip}
  {headMeta}
  {facts}
  {fields}
  {beleg}
  {headActions}
  {saving}
  {dirty}
  bind:mode
  onDelete={() => (deleteOpen = true)}
  listHref="/app/ausgaben"
  listLabel="Ausgaben"
/>

<DeleteConfirm
  bind:open={deleteOpen}
  variant={isErstattet ? "warn" : "simple"}
  title={isErstattet ? "Bereits erstattete Ausgabe löschen" : "Ausgabe löschen?"}
  subtitle={`${detail.businessId} · ${detail.bezeichnung}`}
  reassurance="Noch nicht erstattet — diese Ausgabe lässt sich direkt löschen."
  warnLine={`Am ${fmtDate(detail.erstattetAm)} mit ${formatCentsAsEuro(
    BigInt(Math.abs(detail.betragCents)),
  )} an ${detail.bezahltVonDisplay ?? "Unbekannt"} erstattet. Die Erstattungs-Buchung wird aufgelöst; Verlauf und Beleg gehen verloren.`}
  deltaValue={`+${formatCentsAsEuro(BigInt(Math.abs(detail.betragCents)))}`}
  confirmLabel={isErstattet ? "Endgültig löschen" : "Löschen"}
  onClose={() => (deleteOpen = false)}
/>
