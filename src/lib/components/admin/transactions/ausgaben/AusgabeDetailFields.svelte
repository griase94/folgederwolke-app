<script lang="ts">
  /**
   * AusgabeDetailFields — the editable Ausgabe fields on the detail page.
   * Rendered into TransactionDetailView's `fields` slot (`<form id="detail-form"
   * action="?/save">`; the shell's dock-foot Speichern is `<button
   * form="detail-form">`).
   *
   * B3 M3: the edit mode now wears the same Erfassen-Gerüst as the B2 entry modal
   * — the Betrag+Rechnungsdatum HERO pair (identical anatomy, − prefix so it reads
   * as an outflow), a type-caption, and the read-only LockedSphereField derived
   * from the Kategorie (ADR-0002) instead of a bare chip. Every required label
   * carries the critical-red asterisk. The ?/save field contract is unchanged
   * (bezeichnung · betragCents · rechnungsdatum · kategorieNameSnapshot ·
   * sphereSnapshot · projectId · kommentar).
   */
  import { applyAction, enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import {
    AmountField,
    DateField as HeroDateField,
  } from "$lib/components/ui/hero-field/index.js";
  import KategoriePicker from "$lib/components/admin/transactions/fields/KategoriePicker.svelte";
  import LockedSphereField from "$lib/components/admin/transactions/fields/LockedSphereField.svelte";
  import { FIELD_CLASS } from "$lib/components/admin/transactions/fields/field-class.js";
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
    /** Per-field errors from a failed ?/save (keyed by field name). */
    errors?: Record<string, string[]>;
    /** Bubbled so the page can flip the shell's `dirty` flag. */
    onDirty?: () => void;
    /** Bubbled so the page can feed the shell's `saving` flag during a ?/save. */
    onSaving?: (v: boolean) => void;
    /** Fired on a successful ?/save so the page can reset `dirty` + drop to read. */
    onSaved?: () => void;
  }

  let {
    detail,
    expenseKategorien,
    projects,
    errors = {},
    onDirty,
    onSaving,
    onSaved,
  }: Props = $props();

  function err(field: string): string | null {
    return errors[field]?.[0] ?? null;
  }

  // Betrag hero seed: de-DE display string (comma decimal, ADR-0003). The
  // AmountField owns the hidden name=betragCents integer-cents mirror.
  // svelte-ignore state_referenced_locally
  const betragSeed = (detail.betragCents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // #115: the picker submits the kategorie ID; seed the selection from the row.
  // svelte-ignore state_referenced_locally
  let kategorieSel = $state(detail.kategorieId ?? "");
  // svelte-ignore state_referenced_locally
  let kategorieSphere = $state<Sphere>(detail.sphereSnapshot as Sphere);
  // svelte-ignore state_referenced_locally
  let rechnungsdatum = $state(detail.rechnungsdatum ?? "");
  // svelte-ignore state_referenced_locally
  let projectId = $state(detail.projectId ?? "");

  function markDirty() {
    onDirty?.();
  }

  // Enhance so a failed ?/save (422 validation, 409 festgeschrieben) surfaces via
  // a toast instead of replacing the page; success confirms + resets dirty.
  const saveSubmit = () => {
    onSaving?.(true);
    return async ({
      result,
    }: {
      result: import("@sveltejs/kit").ActionResult;
    }) => {
      onSaving?.(false);
      if (result.type === "success") {
        toast.success("Änderungen gespeichert");
        onSaved?.();
      } else if (result.type === "failure") {
        const e = (result.data as { error?: string } | undefined)?.error;
        toast.error(e ?? "Fehler beim Speichern");
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
  <!-- Betrag-Hero + Rechnungsdatum-Hero (identical anatomy; side-by-side). -->
  <div>
    <div class="grid grid-cols-2 gap-2 sm:gap-3">
      <div class="flex flex-col gap-1.5">
        <label for="d-betrag" class="text-sm font-medium text-ink-900">
          Betrag
          <span class="text-severity-critical" aria-hidden="true">*</span>
        </label>
        <AmountField
          id="d-betrag"
          name="betragCents"
          value={betragSeed}
          type="ausgabe"
          sign="minus"
          required
          aria-invalid={err("betragCents") ? true : undefined}
          onchange={() => markDirty()}
        />
        {#if err("betragCents")}
          <p class="text-xs text-severity-critical">{err("betragCents")}</p>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="d-rechnungsdatum" class="text-sm font-medium text-ink-900">
          Rechnungsdatum
          <span class="text-severity-critical" aria-hidden="true">*</span>
        </label>
        <HeroDateField
          id="d-rechnungsdatum"
          name="rechnungsdatum"
          value={rechnungsdatum}
          required
          aria-invalid={err("rechnungsdatum") ? true : undefined}
          onchange={(iso) => {
            rechnungsdatum = iso;
            markDirty();
          }}
        />
        {#if err("rechnungsdatum")}
          <p class="text-xs text-severity-critical">{err("rechnungsdatum")}</p>
        {/if}
      </div>
    </div>
    <p class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
      <span class="size-1.5 rounded-full bg-type-ausgabe" aria-hidden="true"
      ></span>
      Wird als <b class="font-semibold text-ink-700">Ausgabe</b> mit Minus gebucht.
    </p>
  </div>

  <!-- Bezeichnung -->
  <div class="flex flex-col gap-1.5">
    <label for="d-bezeichnung" class="text-sm font-medium text-ink-900">
      Bezeichnung
      <span class="text-severity-critical" aria-hidden="true">*</span>
    </label>
    <input
      id="d-bezeichnung"
      name="bezeichnung"
      type="text"
      required
      maxlength={500}
      value={detail.bezeichnung}
      aria-invalid={err("bezeichnung") ? true : undefined}
      class={FIELD_CLASS}
    />
    {#if err("bezeichnung")}
      <p class="text-xs text-severity-critical">{err("bezeichnung")}</p>
    {/if}
  </div>

  <!-- Kategorie (drives Sphäre strictly; sphere shown read-only below) -->
  <div class="flex flex-col gap-1.5">
    <KategoriePicker
      id="d-kategorie"
      required
      hideSphere
      options={expenseKategorien}
      value={kategorieSel}
      onChange={(id) => {
        kategorieSel = id;
        markDirty();
      }}
      onSphere={(s) => (kategorieSphere = s)}
    />
    <input type="hidden" name="sphereSnapshot" value={kategorieSphere} />
    {#if err("kategorieId")}
      <p class="text-xs text-severity-critical">{err("kategorieId")}</p>
    {/if}
  </div>

  <!-- Sphäre — read-only, derived from the Kategorie (ADR-0002). -->
  {#if kategorieSel}
    <LockedSphereField sphere={kategorieSphere} />
  {/if}

  {#if projects.length > 0}
    <div class="flex flex-col gap-1.5">
      <label for="d-projectId" class="text-sm font-medium text-ink-900">
        Projekt <span class="text-xs font-normal text-ink-500">(optional)</span>
      </label>
      <select
        id="d-projectId"
        name="projectId"
        bind:value={projectId}
        class={FIELD_CLASS}
      >
        <option value="">— Kein Projekt —</option>
        {#each projects as p (p.id)}
          <option value={p.id}>{p.name}</option>
        {/each}
      </select>
    </div>
  {/if}

  <div class="flex flex-col gap-1.5">
    <label for="d-kommentar" class="text-sm font-medium text-ink-900"
      >Kommentar</label
    >
    <textarea
      id="d-kommentar"
      name="kommentar"
      rows={2}
      maxlength={2000}
      value={detail.kommentar ?? ""}
      class="w-full rounded-[10px] border border-hairline bg-card px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:text-sm"
    ></textarea>
  </div>
</form>
