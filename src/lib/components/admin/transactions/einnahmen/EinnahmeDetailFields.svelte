<script lang="ts">
  /**
   * EinnahmeDetailFields — the editable Income fields on the detail page,
   * rendered into TransactionDetailView's `fields` slot (`<form id="detail-form"
   * action="?/save">`; the shell's dock-foot Speichern is `<button
   * form="detail-form">`).
   *
   * B3 M3: the edit mode wears the B2 Erfassen-Gerüst — the Betrag+Geldeingang
   * HERO pair (identical anatomy, + prefix so it reads as an inflow), a
   * type-caption, and the read-only LockedSphereField derived from the Kategorie
   * (ADR-0002). Every required label carries the critical-red asterisk. The
   * ?/save field contract is unchanged (bezeichnung · betragCents ·
   * geldEingangDatum · kategorieNameSnapshot · sphereSnapshot · projectId ·
   * kommentar).
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
  import { bezeichnungsVorschlaege } from "$lib/domain/bezeichnung-vorschlaege.js";
  import type { Sphere } from "$lib/domain/sphere.js";

  interface KategorieOption {
    id: string;
    name: string;
    sphere: Sphere;
    eurZeile?: string | number | null;
  }

  interface Props {
    /** Initial values from the loaded detail. */
    bezeichnung: string;
    betragCents: number;
    geldEingangDatum: string | null;
    /** #115: the current row's Kategorie FK — pre-selects the picker by id. */
    kategorieId: string | null;
    projectId: string | null;
    kommentar: string | null;
    /** Income kategorie options for the picker. */
    kategorien: KategorieOption[];
    /** Active projects for the optional Projekt field. */
    projects: { id: string; name: string }[];
    /** Per-field errors from a failed ?/save (keyed by field name). */
    errors?: Record<string, string[]>;
    /** Fired on the first edit so the tab can flip the shell's `dirty`. */
    onDirty?: () => void;
    /** Bubbled so the page can feed the shell's `saving` flag during a ?/save. */
    onSaving?: (v: boolean) => void;
    /** Fired on a successful ?/save so the page can reset `dirty` + drop to read. */
    onSaved?: () => void;
  }

  let {
    bezeichnung,
    betragCents,
    geldEingangDatum,
    kategorieId,
    projectId,
    kommentar,
    kategorien,
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
  const betragSeed = (betragCents / 100).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // svelte-ignore state_referenced_locally
  let geld = $state(geldEingangDatum ?? "");
  // #115: the picker submits the kategorie ID; seed the selection from the row.
  // svelte-ignore state_referenced_locally
  let kategorieSel = $state(kategorieId ?? "");
  // Seed the sphere from the current Kategorie so the LockedSphereField + the
  // hidden mirror are correct on first render (not only after a Kategorie change).
  // svelte-ignore state_referenced_locally
  let sphere = $state<Sphere>(
    kategorien.find((k) => k.id === kategorieId)?.sphere ?? "ideeller",
  );
  // svelte-ignore state_referenced_locally
  let projectSel = $state(projectId ?? "");

  function markDirty() {
    onDirty?.();
  }

  // #115 Stufe 4: free-text Bezeichnungs-Vorschläge for the chosen Kategorie.
  const vorschlaege = $derived(
    bezeichnungsVorschlaege(kategorien.find((k) => k.id === kategorieSel)?.name),
  );

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
  <input type="hidden" name="sphereSnapshot" value={sphere} />

  <!-- Betrag-Hero + Geldeingang-Hero (identical anatomy; side-by-side). -->
  <div>
    <div class="grid grid-cols-2 gap-2 sm:gap-3">
      <div class="flex flex-col gap-1.5">
        <label for="detail-betrag" class="text-sm font-medium text-ink-900">
          Betrag
          <span class="text-severity-critical" aria-hidden="true">*</span>
        </label>
        <AmountField
          id="detail-betrag"
          name="betragCents"
          value={betragSeed}
          type="einnahme"
          sign="plus"
          required
          aria-invalid={err("betragCents") ? true : undefined}
          onchange={() => markDirty()}
        />
        {#if err("betragCents")}
          <p class="text-xs text-severity-critical">{err("betragCents")}</p>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="detail-geld" class="text-sm font-medium text-ink-900">
          Geldeingang
          <span class="text-severity-critical" aria-hidden="true">*</span>
        </label>
        <HeroDateField
          id="detail-geld"
          name="geldEingangDatum"
          value={geld}
          required
          aria-invalid={err("geldEingangDatum") ? true : undefined}
          onchange={(iso) => {
            geld = iso;
            markDirty();
          }}
        />
        {#if err("geldEingangDatum")}
          <p class="text-xs text-severity-critical">{err("geldEingangDatum")}</p>
        {/if}
      </div>
    </div>
    <p class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
      <span class="size-1.5 rounded-full bg-type-einnahme" aria-hidden="true"
      ></span>
      Wird als <b class="font-semibold text-ink-700">Einnahme</b> mit Plus gebucht.
    </p>
  </div>

  <!-- Bezeichnung -->
  <div class="flex flex-col gap-1.5">
    <label for="detail-bezeichnung" class="text-sm font-medium text-ink-900">
      Bezeichnung
      <span class="text-severity-critical" aria-hidden="true">*</span>
    </label>
    <input
      id="detail-bezeichnung"
      name="bezeichnung"
      type="text"
      required
      maxlength="500"
      bind:value={bezeichnung}
      list={vorschlaege.length
        ? "einnahme-detail-bezeichnung-vorschlaege"
        : undefined}
      aria-invalid={err("bezeichnung") ? true : undefined}
      class={FIELD_CLASS}
    />
    {#if vorschlaege.length}
      <!-- #115 Stufe 4: per-Kategorie hints; the field stays free-text. -->
      <datalist id="einnahme-detail-bezeichnung-vorschlaege">
        {#each vorschlaege as v (v)}
          <option value={v}></option>
        {/each}
      </datalist>
    {/if}
    {#if err("bezeichnung")}
      <p class="text-xs text-severity-critical">{err("bezeichnung")}</p>
    {/if}
  </div>

  <!-- Kategorie (drives Sphäre strictly; sphere shown read-only below) -->
  <div class="flex flex-col gap-1.5">
    <KategoriePicker
      options={kategorien}
      value={kategorieSel}
      required
      hideSphere
      onChange={(id) => {
        kategorieSel = id;
        markDirty();
      }}
      onSphere={(s) => (sphere = s)}
    />
    {#if err("kategorieId")}
      <p class="text-xs text-severity-critical">{err("kategorieId")}</p>
    {/if}
  </div>

  <!-- Sphäre — read-only, derived from the Kategorie (ADR-0002). -->
  {#if kategorieSel}
    <LockedSphereField sphere={sphere as Sphere} />
  {/if}

  {#if projects.length > 0}
    <div class="flex flex-col gap-1.5">
      <label for="detail-project" class="text-sm font-medium text-ink-900">
        Projekt <span class="text-xs font-normal text-ink-500">(optional)</span>
      </label>
      <select
        id="detail-project"
        name="projectId"
        bind:value={projectSel}
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
    <label for="detail-kommentar" class="text-sm font-medium text-ink-900"
      >Kommentar</label
    >
    <textarea
      id="detail-kommentar"
      name="kommentar"
      rows="3"
      maxlength="2000"
      value={kommentar ?? ""}
      class="w-full rounded-[10px] border border-hairline bg-card px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:text-sm"
    ></textarea>
  </div>
</form>
