<script lang="ts">
  /**
   * AusgabeDetailFields — the editable Ausgabe fields on the detail page (Phase 4,
   * Task 5). Rendered into `DetailModalShell`'s `fields` slot.
   *
   * The shell's footer Speichern button is `<button form="detail-form">`, so the
   * editable inputs are wrapped in `<form id="detail-form" method="POST"
   * action="?/save">` here (the form lives in the tab; the shell only owns the
   * button + the read-only `inert` wrapper when festgeschrieben).
   *
   * Sphäre is read-only context (a SphereBadge) — re-categorization happens via
   * the Kategorie picker, which re-derives sphere server-side on ?/save.
   */
  import { applyAction, enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import DateField from "$lib/components/ui/date-field/DateField.svelte";
  import SphereBadge from "$lib/components/admin/transactions/fields/SphereBadge.svelte";
  import KategoriePicker from "$lib/components/admin/transactions/fields/KategoriePicker.svelte";
  import type { Sphere } from "$lib/domain/sphere.js";
  import type { TransactionDetail } from "$lib/server/domain/transactions.js";

  interface KategorieRow {
    id: string;
    name: string;
    sphere: Sphere;
  }
  interface ProjectRow {
    id: string;
    name: string;
  }

  interface Props {
    detail: TransactionDetail;
    expenseKategorien: KategorieRow[];
    projects: ProjectRow[];
    /** Bubbled so the page can flip the shell's `dirty` flag. */
    onDirty?: () => void;
    /** Bubbled so the page can feed the shell's `saving` flag during a ?/save. */
    onSaving?: (v: boolean) => void;
  }

  let { detail, expenseKategorien, projects, onDirty, onSaving }: Props =
    $props();

  // svelte-ignore state_referenced_locally
  let betragCents = $state(String(detail.betragCents));
  // svelte-ignore state_referenced_locally
  let kategorieName = $state(detail.kategorieNameSnapshot);
  // svelte-ignore state_referenced_locally
  let kategorieSphere = $state<Sphere>(detail.sphereSnapshot as Sphere);
  // svelte-ignore state_referenced_locally
  let rechnungsdatum = $state(detail.rechnungsdatum ?? "");
  // svelte-ignore state_referenced_locally
  let projectId = $state(detail.projectId ?? "");

  const betragEuros = $derived((detail.betragCents / 100).toFixed(2));

  function markDirty() {
    onDirty?.();
  }

  // T4 (review): without use:enhance a failed ?/save (422 validation, 409
  // festgeschrieben, …) replaced the page with a server-rendered failure and the
  // user saw nothing in this modal. Enhance it: surface the error via a toast on
  // `failure`, then applyAction for the success/redirect path as usual.
  const saveSubmit = () => {
    onSaving?.(true);
    return async ({
      result,
    }: {
      result: import("@sveltejs/kit").ActionResult;
    }) => {
      onSaving?.(false);
      if (result.type === "failure") {
        const err = (result.data as { error?: string } | undefined)?.error;
        toast.error(err ?? "Fehler beim Speichern");
      }
      await applyAction(result);
    };
  };
</script>

<form
  id="detail-form"
  method="POST"
  action="?/save"
  class="flex flex-col gap-4"
  oninput={markDirty}
  onchange={markDirty}
  use:enhance={saveSubmit}
>
  <div class="flex flex-col gap-1.5">
    <label for="d-bezeichnung" class="text-foreground text-sm font-medium"
      >Bezeichnung</label
    >
    <input
      id="d-bezeichnung"
      name="bezeichnung"
      type="text"
      required
      maxlength={500}
      value={detail.bezeichnung}
      class="border-border bg-background focus:ring-primary rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
    />
  </div>

  <div class="flex flex-col gap-1.5">
    <label for="d-betrag" class="text-foreground text-sm font-medium"
      >Betrag (€)</label
    >
    <div class="relative">
      <span
        class="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm"
        >€</span
      >
      <input
        id="d-betrag"
        type="number"
        step="0.01"
        min="0.01"
        required
        value={betragEuros}
        oninput={(e) => {
          const v =
            parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
          betragCents = String(Math.round(v * 100));
        }}
        class="border-border bg-background focus:ring-primary w-full rounded-md border py-2 pr-3 pl-8 text-sm focus:ring-2 focus:outline-none"
      />
      <input type="hidden" name="betragCents" value={betragCents} />
    </div>
  </div>

  <div class="flex flex-col gap-1.5">
    <label for="d-rechnungsdatum" class="text-foreground text-sm font-medium"
      >Rechnungsdatum</label
    >
    <DateField
      id="d-rechnungsdatum"
      name="rechnungsdatum"
      value={rechnungsdatum}
      onchange={(iso) => {
        rechnungsdatum = iso;
        markDirty();
      }}
    />
  </div>

  <!-- KategoriePicker owns its single <label> — no outer wrapper label (that
	     produced a duplicate "Kategorie" heading above the picker's own label). -->
  <div class="flex flex-col gap-1.5">
    <KategoriePicker
      id="d-kategorie"
      name="kategorieNameSnapshot"
      required
      options={expenseKategorien}
      value={kategorieName}
      onChange={(name) => {
        kategorieName = name;
        markDirty();
      }}
      onSphere={(s) => (kategorieSphere = s)}
    />
    <input type="hidden" name="sphereSnapshot" value={kategorieSphere} />
    <div class="mt-1">
      <SphereBadge sphere={kategorieSphere} />
    </div>
  </div>

  {#if projects.length > 0}
    <div class="flex flex-col gap-1.5">
      <label for="d-projectId" class="text-foreground text-sm font-medium"
        >Projekt</label
      >
      <select
        id="d-projectId"
        name="projectId"
        bind:value={projectId}
        class="border-border bg-background focus:ring-primary rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
      >
        <option value="">— Kein Projekt —</option>
        {#each projects as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </div>
  {/if}

  <div class="flex flex-col gap-1.5">
    <label for="d-kommentar" class="text-foreground text-sm font-medium"
      >Kommentar</label
    >
    <textarea
      id="d-kommentar"
      name="kommentar"
      rows={2}
      maxlength={2000}
      value={detail.kommentar ?? ""}
      class="border-border bg-background focus:ring-primary rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
    ></textarea>
  </div>
</form>
