<script lang="ts">
  /**
   * EinnahmeDetailFields — Phase 5 / Task 5 (Tier C2). The editable income
   * fields the DetailModalShell renders on the right column: Bezeichnung ·
   * Betrag (€ → hidden betragCents) · Geldeingang (DateField) · Kategorie
   * (+ derived Sphäre) · Projekt · Kommentar.
   *
   * The DetailModalShell footer's Speichern button submits the shell's
   * `detail-form`; these inputs carry `form="detail-form"` so they're part of
   * that submission even though the shell renders them in a separate region.
   * When `isFestgeschrieben` the shell wraps this region in `inert` — the
   * fields are visually + interactively read-only (no per-input disabling
   * needed here).
   *
   * Edits flip `dirty` (gates the shell's Speichern + the unsaved-changes
   * guard) via `onDirty`.
   */
  import { applyAction, enhance } from "$app/forms";
  import { toast } from "svelte-sonner";
  import KategoriePicker from "$lib/components/admin/transactions/fields/KategoriePicker.svelte";
  import { DateField } from "$lib/components/ui/date-field/index.js";
  import type { Sphere } from "$lib/domain/sphere.js";

  interface KategorieOption {
    name: string;
    sphere: Sphere;
    eurZeile?: string | number | null;
  }

  interface Props {
    /** Initial values from the loaded detail. */
    bezeichnung: string;
    betragCents: number;
    geldEingangDatum: string | null;
    kategorieNameSnapshot: string;
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
    /** FIX B (review): fired on a successful ?/save so the page can reset `dirty`. */
    onSaved?: () => void;
  }

  let {
    bezeichnung,
    betragCents,
    geldEingangDatum,
    kategorieNameSnapshot,
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

  const FORM_ID = "detail-form";

  // ── Local editable state seeded ONCE from the detail props ──────────────────
  // The detail is loaded once per page render; these inputs are intentionally
  // seeded from the initial prop values and then owned locally (the user edits
  // them). The "captures only the initial value" hints are expected here.
  // svelte-ignore state_referenced_locally
  let betragEur = $state((betragCents / 100).toFixed(2));
  // svelte-ignore state_referenced_locally
  let geld = $state(geldEingangDatum ?? "");
  // svelte-ignore state_referenced_locally
  let kategorieName = $state(kategorieNameSnapshot);
  let sphere = $state<Sphere | "">("");

  const betragCentsOut = $derived(
    Math.round(parseFloat(betragEur || "0") * 100),
  );

  function markDirty() {
    onDirty?.();
  }

  // T4 (review): enhance the ?/save so a failed save (422 validation, 409
  // festgeschrieben, …) surfaces a toast in the modal instead of silently
  // replacing the page. applyAction still runs for the success/redirect path.
  const saveSubmit = () => {
    onSaving?.(true);
    return async ({
      result,
    }: {
      result: import("@sveltejs/kit").ActionResult;
    }) => {
      onSaving?.(false);
      if (result.type === "success") {
        // FIX B (review): confirm save + reset dirty so Speichern stays disabled.
        toast.success("Änderungen gespeichert");
        onSaved?.();
      } else if (result.type === "failure") {
        const err = (result.data as { error?: string } | undefined)?.error;
        toast.error(err ?? "Fehler beim Speichern");
      }
      await applyAction(result);
    };
  };
</script>

<!-- The shell's footer Speichern submits #detail-form. We render the actual
     <form id="detail-form"> here so the editable inputs are its controls. -->
<form
  id={FORM_ID}
  method="POST"
  action="?/save"
  class="flex flex-col gap-4"
  use:enhance={saveSubmit}
>
  <input type="hidden" name="betragCents" value={betragCentsOut} />
  <input type="hidden" name="sphereSnapshot" value={sphere} />

  <!-- Bezeichnung -->
  <div class="flex flex-col gap-1.5">
    <label for="detail-bezeichnung" class="text-foreground text-sm font-medium">
      Bezeichnung<span class="text-destructive" aria-hidden="true">&nbsp;*</span
      >
    </label>
    <input
      id="detail-bezeichnung"
      name="bezeichnung"
      type="text"
      required
      maxlength="500"
      bind:value={bezeichnung}
      oninput={markDirty}
      aria-invalid={err("bezeichnung") ? true : undefined}
      class="border-input bg-background focus-visible:ring-ring h-11 min-h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-1"
    />
    {#if err("bezeichnung")}
      <p class="text-destructive text-xs">{err("bezeichnung")}</p>
    {/if}
  </div>

  <!-- Betrag (€) -->
  <div class="flex flex-col gap-1.5">
    <label for="detail-betrag" class="text-foreground text-sm font-medium">
      Betrag (€)<span class="text-destructive" aria-hidden="true">&nbsp;*</span>
    </label>
    <input
      id="detail-betrag"
      type="number"
      inputmode="decimal"
      step="0.01"
      min="0"
      required
      bind:value={betragEur}
      oninput={markDirty}
      aria-invalid={err("betragCents") ? true : undefined}
      class="border-input bg-background focus-visible:ring-ring h-11 min-h-11 w-full rounded-md border px-3 text-sm tabular-nums outline-none focus-visible:ring-1"
    />
    {#if err("betragCents")}
      <p class="text-destructive text-xs">{err("betragCents")}</p>
    {/if}
  </div>

  <!-- Geldeingang — pre-filled from the loaded detail's geldEingangDatum
	     (getTransactionDetail now projects geld_eingang_datum). -->
  <div class="flex flex-col gap-1.5">
    <label for="detail-geld" class="text-foreground text-sm font-medium"
      >Geldeingang</label
    >
    <DateField
      id="detail-geld"
      name="geldEingangDatum"
      value={geld}
      onchange={(iso) => {
        geld = iso;
        markDirty();
      }}
    />
    {#if err("geldEingangDatum")}
      <p class="text-destructive text-xs">{err("geldEingangDatum")}</p>
    {/if}
  </div>

  <!-- Kategorie (+ derived Sphäre) -->
  <div class="flex flex-col gap-1.5">
    <KategoriePicker
      options={kategorien}
      value={kategorieName}
      required
      onChange={(name) => {
        kategorieName = name;
        markDirty();
      }}
      onSphere={(s) => (sphere = s)}
    />
    {#if err("kategorieNameSnapshot")}
      <p class="text-destructive text-xs">{err("kategorieNameSnapshot")}</p>
    {/if}
  </div>

  <!-- Projekt (optional) -->
  <div class="flex flex-col gap-1.5">
    <label for="detail-project" class="text-foreground text-sm font-medium"
      >Projekt (optional)</label
    >
    <select
      id="detail-project"
      name="projectId"
      value={projectId ?? ""}
      onchange={markDirty}
      class="border-input bg-background focus-visible:ring-ring h-11 min-h-11 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-1"
    >
      <option value="">— kein Projekt —</option>
      {#each projects as p (p.id)}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
  </div>

  <!-- Kommentar -->
  <div class="flex flex-col gap-1.5">
    <label for="detail-kommentar" class="text-foreground text-sm font-medium"
      >Kommentar</label
    >
    <textarea
      id="detail-kommentar"
      name="kommentar"
      rows="3"
      maxlength="2000"
      value={kommentar ?? ""}
      oninput={markDirty}
      class="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-1"
    ></textarea>
  </div>
</form>
