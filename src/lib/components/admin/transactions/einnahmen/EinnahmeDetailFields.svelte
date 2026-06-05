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
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import { DateField } from '$lib/components/ui/date-field/index.js';
	import type { Sphere } from '$lib/domain/sphere.js';

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
		/** Fired on the first edit so the tab can flip the shell's `dirty`. */
		onDirty?: () => void;
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
		onDirty
	}: Props = $props();

	const FORM_ID = 'detail-form';

	// ── Local editable state seeded ONCE from the detail props ──────────────────
	// The detail is loaded once per page render; these inputs are intentionally
	// seeded from the initial prop values and then owned locally (the user edits
	// them). The "captures only the initial value" hints are expected here.
	// svelte-ignore state_referenced_locally
	let betragEur = $state((betragCents / 100).toFixed(2));
	// svelte-ignore state_referenced_locally
	let geld = $state(geldEingangDatum ?? '');
	// svelte-ignore state_referenced_locally
	let kategorieName = $state(kategorieNameSnapshot);
	let sphere = $state<Sphere | ''>('');

	const betragCentsOut = $derived(Math.round(parseFloat(betragEur || '0') * 100));

	function markDirty() {
		onDirty?.();
	}
</script>

<!-- The shell's footer Speichern submits #detail-form. We render the actual
     <form id="detail-form"> here so the editable inputs are its controls. -->
<form id={FORM_ID} method="POST" action="?/save" class="flex flex-col gap-4">
	<input type="hidden" name="betragCents" value={betragCentsOut} />
	<input type="hidden" name="sphereSnapshot" value={sphere} />

	<!-- Bezeichnung -->
	<div class="flex flex-col gap-1.5">
		<label for="detail-bezeichnung" class="text-sm font-medium text-foreground">
			Bezeichnung<span class="text-destructive" aria-hidden="true">&nbsp;*</span>
		</label>
		<input
			id="detail-bezeichnung"
			name="bezeichnung"
			type="text"
			required
			maxlength="500"
			bind:value={bezeichnung}
			oninput={markDirty}
			class="h-11 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
		/>
	</div>

	<!-- Betrag (€) -->
	<div class="flex flex-col gap-1.5">
		<label for="detail-betrag" class="text-sm font-medium text-foreground">
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
			class="h-11 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring"
		/>
	</div>

	<!-- Geldeingang -->
	<!--
		The detail projection (getTransactionDetail, shared) does not currently
		carry geld_eingang_datum, so this field cannot be pre-filled. The save
		action only WRITES it when non-blank (a blank leaves the stored value
		untouched), so a blank field is NOT data loss — the hint says so to the
		admin. Hint can be dropped once the shared projection threads the value.
	-->
	<div class="flex flex-col gap-1.5">
		<label for="detail-geld" class="text-sm font-medium text-foreground">Geldeingang</label>
		<DateField
			id="detail-geld"
			name="geldEingangDatum"
			value={geld}
			aria-describedby="detail-geld-hint"
			onchange={(iso) => {
				geld = iso;
				markDirty();
			}}
		/>
		<p id="detail-geld-hint" class="text-xs text-muted-foreground">
			Aktuelles Datum bleibt erhalten, wenn leer.
		</p>
	</div>

	<!-- Kategorie (+ derived Sphäre) -->
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

	<!-- Projekt (optional) -->
	<div class="flex flex-col gap-1.5">
		<label for="detail-project" class="text-sm font-medium text-foreground">Projekt (optional)</label>
		<select
			id="detail-project"
			name="projectId"
			value={projectId ?? ''}
			onchange={markDirty}
			class="h-11 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
		>
			<option value="">— kein Projekt —</option>
			{#each projects as p (p.id)}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>
	</div>

	<!-- Kommentar -->
	<div class="flex flex-col gap-1.5">
		<label for="detail-kommentar" class="text-sm font-medium text-foreground">Kommentar</label>
		<textarea
			id="detail-kommentar"
			name="kommentar"
			rows="3"
			maxlength="2000"
			value={kommentar ?? ''}
			oninput={markDirty}
			class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
		></textarea>
	</div>
</form>
