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
	 * SphereBadge inline.
	 *
	 * The "Anlage EÜR Zeile {n}" hint is shown ONLY when the chosen option carries a
	 * non-null `eurZeile` (P44-04: the eur_zeile/anlage_gem_zeile columns are NULL
	 * pre-launch, so the hint must NOT depend on a Zeile being present). When the
	 * Steuerberater later supplies Zeilen, the tab's option loader passes `eurZeile`
	 * and the real number appears — no contract change needed.
	 *
	 * Native <select> (role=combobox) — kept dependency-free + AT-reachable; the
	 * A3 ui/combobox is reserved for the large filter pickers, this is a single
	 * required field inside a dense form.
	 */
	import { kategorieSphere, type Sphere } from '$lib/domain/sphere.js';
	import SphereBadge from './SphereBadge.svelte';
	import { FIELD_CLASS } from './field-class.js';

	/** A kategorie option; `eurZeile` is forward-compatible + NULL pre-launch (P44-04). */
	export interface KategorieOption {
		/** The kategorie NAME-SNAPSHOT (P2-04) — used as both option value + emitted name. */
		name: string;
		sphere: Sphere;
		/** Anlage-EÜR line number, when the Steuerberater has assigned one. */
		eurZeile?: string | number | null;
	}

	interface Props {
		/** Kategorie options as `{ name, sphere, eurZeile? }` — `name` is the NAME-SNAPSHOT (P2-04). */
		options: KategorieOption[];
		/** Currently-selected kategorie NAME (snapshot string), or "" when unset. */
		value: string;
		/** Emitted with the chosen kategorie name. */
		onChange: (name: string) => void;
		/** Emitted with the sphere derived strictly from the chosen kategorie. */
		onSphere: (sphere: Sphere) => void;
		/** Optional: a label/field id so the form can wire <label for>. */
		id?: string;
		/**
		 * The submitted form-field name. Defaults to `kategorieNameSnapshot` —
		 * the field EVERY transaction create/save schema reads (P2-04). The inbox
		 * approve forms read a plain `kategorieName` instead, so they pass
		 * `name="kategorieName"` explicitly.
		 */
		name?: string;
		required?: boolean;
		/**
		 * Visually hide the built-in `<label>` (kept for AT via sr-only) when the
		 * host already renders its own label — e.g. the inbox DecisionBand's label
		 * row. Default false keeps the label visible for transaction forms.
		 */
		hideLabel?: boolean;
		/**
		 * Suppress the inline derived-Sphäre badge when the host renders the Sphäre
		 * itself (the DecisionBand shows it in its label row). Default false.
		 */
		hideSphere?: boolean;
	}

	let {
		options,
		value,
		onChange,
		onSphere,
		id = 'kategorie',
		name = 'kategorieNameSnapshot',
		required = false,
		hideLabel = false,
		hideSphere = false,
	}: Props = $props();

	// Derived sphere for the current value (only meaningful once a value is chosen).
	const derivedSphere = $derived(value ? kategorieSphere(options, value) : null);

	// The Anlage-EÜR Zeile of the selected option, when present (P44-04: NULL pre-launch).
	const selectedOption = $derived(value ? (options.find((o) => o.name === value) ?? null) : null);
	const eurZeile = $derived(
		selectedOption?.eurZeile != null && selectedOption.eurZeile !== ''
			? selectedOption.eurZeile
			: null,
	);

	function onSelect(e: Event) {
		const next = (e.currentTarget as HTMLSelectElement).value;
		onChange(next);
		// Strict derivation — no project override (ADR-0008 lives in the write path).
		onSphere(kategorieSphere(options, next));
	}
</script>

<div class="flex flex-col gap-1.5" data-slot="kategorie-picker">
	<label
		for={id}
		class={hideLabel ? 'sr-only' : 'text-sm font-medium text-foreground'}
	>
		Kategorie{#if required}<span class="text-destructive" aria-hidden="true">&nbsp;*</span>{/if}
	</label>
	<!-- Aurora FIELD_CLASS on the select — unified h-11/rounded-[10px]/border-hairline.
	     The inbox DecisionBand variant (hideLabel=true) previously used a different style
	     but now shares the same FIELD_CLASS baseline. -->
	<select
		{id}
		{name}
		{required}
		{value}
		onchange={onSelect}
		class={FIELD_CLASS}
	>
		<option value="">Kategorie wählen…</option>
		{#each options as opt (opt.name)}
			<option value={opt.name}>{opt.name}</option>
		{/each}
	</select>

	{#if derivedSphere && !hideSphere}
		<!-- Derived Sphäre (§13 palette) — "Sphäre:" caption prefix (B4); the EÜR-Zeile hint only when a Zeile exists. -->
		<div class="flex flex-wrap items-center gap-2 text-xs text-ink-500">
			<span class="font-medium text-ink-700">Sphäre:</span>
			<SphereBadge sphere={derivedSphere} />
			{#if eurZeile != null}
				<span data-slot="euer-hint">Anlage EÜR Zeile {eurZeile}</span>
			{/if}
		</div>
	{/if}
</div>
