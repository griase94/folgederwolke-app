<script lang="ts">
	/**
	 * KategoriePicker — Task 8, Phase 3. Shared Kategorie field for every
	 * transaction entry form (Phases 4/5/6 inject it into their `fields` snippet).
	 *
	 * The Sphäre is derived STRICTLY from the chosen kategorie via `kategorieSphere`
	 * (Phase 1, spec §4.5) — it NEVER consults a project sphere_default (that lives
	 * in the domain write path, ADR-0008). On change we surface both the chosen
	 * name (`onChange`) and the derived sphere (`onSphere`) so the tab can mirror the
	 * sphere into its hidden write-time snapshot field, and we render the §13
	 * SphereBadge + an "Anlage EÜR Zeile" hint inline.
	 *
	 * Native <select> (role=combobox) — kept dependency-free + AT-reachable; the
	 * A3 ui/combobox is reserved for the large filter pickers, this is a single
	 * required field inside a dense form.
	 */
	import { kategorieSphere, type Sphere } from '$lib/domain/sphere.js';
	import SphereBadge from './SphereBadge.svelte';

	interface Props {
		/** Kategorie options as `{ name, sphere }` — `name` is the NAME-SNAPSHOT (P2-04). */
		options: { name: string; sphere: Sphere }[];
		/** Currently-selected kategorie NAME (snapshot string), or "" when unset. */
		value: string;
		/** Emitted with the chosen kategorie name. */
		onChange: (name: string) => void;
		/** Emitted with the sphere derived strictly from the chosen kategorie. */
		onSphere: (sphere: Sphere) => void;
		/** Optional: a label/field id so the form can wire <label for>. */
		id?: string;
		name?: string;
		required?: boolean;
	}

	let {
		options,
		value,
		onChange,
		onSphere,
		id = 'kategorie',
		name = 'kategorieName',
		required = false,
	}: Props = $props();

	// Derived sphere for the current value (only meaningful once a value is chosen).
	const derivedSphere = $derived(value ? kategorieSphere(options, value) : null);

	function onSelect(e: Event) {
		const next = (e.currentTarget as HTMLSelectElement).value;
		onChange(next);
		// Strict derivation — no project override (ADR-0008 lives in the write path).
		onSphere(kategorieSphere(options, next));
	}
</script>

<div class="flex flex-col gap-1.5" data-slot="kategorie-picker">
	<label for={id} class="text-sm font-medium text-foreground">
		Kategorie{#if required}<span class="text-destructive" aria-hidden="true">&nbsp;*</span>{/if}
	</label>
	<select
		{id}
		{name}
		{required}
		{value}
		aria-label="Kategorie"
		onchange={onSelect}
		class="h-11 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
	>
		<option value="">Kategorie wählen…</option>
		{#each options as opt (opt.name)}
			<option value={opt.name}>{opt.name}</option>
		{/each}
	</select>

	{#if derivedSphere}
		<!-- Derived Sphäre (§13 palette) + Anlage/EÜR-Zeile hint (spec §7.2). -->
		<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
			<SphereBadge sphere={derivedSphere} />
			<span data-slot="euer-hint">Anlage EÜR Zeile</span>
		</div>
	{/if}
</div>
