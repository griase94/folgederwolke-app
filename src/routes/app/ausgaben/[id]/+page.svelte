<script lang="ts">
  /**
   * /app/ausgaben/[id] — Ausgabe detail (Phase 4, Task 5).
   *
   * Renders the editable `AusgabeDetailFields` + `BelegViewer` inside the shared
   * `DetailModalShell`. The shell owns the header / Verlauf / unified Speichern
   * (form="detail-form") / unsaved-changes guard / festgeschrieben read-only.
   * The tab supplies:
   *   - the `fields` snippet (the ?/save form),
   *   - the `beleg` snippet (a BelegViewer, inline desktop / fold mobile — only
   *     when a Beleg is attached),
   *   - the `workflowAction` snippet: "Als bezahlt markieren" (?/mark-paid, the
   *     no-mail path) shown only while the Auslage is open, plus a
   *     duplicate-as-template action (?/duplicate → prefill /app/ausgaben/neu).
   */
  import { applyAction, enhance } from "$app/forms";
  import { page } from "$app/stores";
  import { goto, invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import DetailModalShell from "$lib/components/admin/transactions/DetailModalShell.svelte";
  import BelegViewer from "$lib/components/files/BelegViewer.svelte";
  import AusgabeDetailFields from "$lib/components/admin/transactions/ausgaben/AusgabeDetailFields.svelte";
  import { statusPresentation } from "$lib/domain/transaction-status.js";
  import type { PageData } from "./$types.js";

  let { data }: { data: PageData } = $props();

  let dirty = $state(false);
  let saving = $state(false);

  const today = new Date().toISOString().slice(0, 10);
  let markPaidDatum = $state(today);
  let markPaidZahlartId = $state("");

  // "Als bezahlt markieren" is offered only while the Auslage is open (approved,
  // not yet erstattet) and not festgeschrieben — same gate as markExpenseAsPaid.
  const canMarkPaid = $derived(
    !data.isFestgeschrieben &&
      data.detail.approvedAt !== null &&
      data.detail.erstattetAm === null,
  );

  function onClose() {
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    goto("/app/ausgaben");
  }

  // duplicate-as-template: the action returns a prefill (payment-state reset);
  // forward it to the entry form via query params so the new Ausgabe starts
  // unpaid with a fresh (empty) Beleg (spec §7.2 recurring-Miete safety).
  function buildPrefillQuery(prefill: Record<string, unknown>): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local one-shot URL builder, not a reactive store
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(prefill)) {
      if (v !== null && v !== undefined && v !== "") params.set(k, String(v));
    }
    return params.toString();
  }
</script>

<svelte:head>
  <title>{data.detail.bezeichnung} – Ausgaben – {$page.data.vereinName}</title>
</svelte:head>

{#snippet headerBadge()}
  {@const sp = statusPresentation(data.detail.status ?? "")}
  <span
    data-testid="detail-status-badge"
    class={[
      "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
      sp.tone,
    ].join(" ")}
  >
    {sp.label}
  </span>
{/snippet}

{#snippet fields()}
  <AusgabeDetailFields
    detail={data.detail}
    expenseKategorien={data.expenseKategorien}
    projects={data.projects}
    onDirty={() => (dirty = true)}
    onSaving={(v) => (saving = v)}
    onSaved={() => (dirty = false)}
  />
{/snippet}

{#snippet beleg()}
  {#if data.detail.belegFileId}
    <!-- Desktop inline viewer; the shell stacks it above the fields on mobile. -->
    <BelegViewer
      fileId={data.detail.belegFileId}
      mimeType={data.detail.belegMimeType ?? "application/octet-stream"}
      originalFilename={data.detail.belegOriginalName ?? "Beleg"}
      mode="inline"
    />
  {:else}
    <p class="text-muted-foreground text-sm">Kein Beleg hinterlegt.</p>
  {/if}
{/snippet}

{#snippet workflowAction()}
  <div class="flex flex-wrap items-center gap-2">
    <!-- duplicate-as-template (always available) -->
    <form
      method="POST"
      action="?/duplicate"
      use:enhance={() => {
        return async ({ result }) => {
          if (result.type === "success" && result.data) {
            const prefill = (
              result.data as { prefill?: Record<string, unknown> }
            ).prefill;
            if (prefill) {
              const qs = buildPrefillQuery(prefill);
              // eslint-disable-next-line svelte/no-navigation-without-resolve
              goto(`/app/ausgaben/neu${qs ? `?${qs}` : ""}`);
              return;
            }
          }
          // T4 (review): surface a failed ?/duplicate instead of dropping it.
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
        class="border-border bg-background hover:bg-accent inline-flex h-11 min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium"
      >
        Als Vorlage duplizieren
      </button>
    </form>

    <!-- Als bezahlt markieren (?/mark-paid, no-mail) — only while open -->
    {#if canMarkPaid}
      <form
        method="POST"
        action="?/mark-paid"
        use:enhance={() => {
          saving = true;
          return async ({ result }) => {
            saving = false;
            // T4 (review): surface a failed ?/mark-paid (e.g. festgeschrieben 409).
            if (result.type === "failure") {
              const err = (result.data as { error?: string } | undefined)
                ?.error;
              toast.error(err ?? "Als bezahlt markieren fehlgeschlagen");
            }
            await applyAction(result);
            // Re-run the load so the now-erstattet status (badge + the
            // disappearing mark-paid form) reflects the change. applyAction
            // alone updates page.form but does NOT re-fetch the detail.
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
          class="border-border bg-background h-11 min-h-11 rounded-md border px-2 text-sm"
        />
        <select
          name="zahlartId"
          bind:value={markPaidZahlartId}
          class="border-border bg-background h-11 min-h-11 rounded-md border px-2 text-sm"
        >
          <option value="">— Zahlungsart —</option>
          {#each data.zahlungsarten as z (z.id)}
            <option value={z.id}>{z.label}</option>
          {/each}
        </select>
        <button
          type="submit"
          class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium"
        >
          Als bezahlt markieren
        </button>
      </form>
    {/if}
  </div>
{/snippet}

<DetailModalShell
  detail={data.detail}
  isFestgeschrieben={data.isFestgeschrieben}
  {beleg}
  {fields}
  {headerBadge}
  {workflowAction}
  {saving}
  {dirty}
  {onClose}
/>
