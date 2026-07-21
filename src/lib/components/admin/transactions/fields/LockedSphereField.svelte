<script lang="ts" module>
	import type { Sphere } from '$lib/domain/sphere.js';

	/**
	 * The sphere swatch colour token per §13 (light/dark handled by the token).
	 * Mirrors the plate `.locked-field .swatch` background: `var(--sphere-<s>)`.
	 */
	export const SPHERE_SWATCH_VAR: Record<Sphere, string> = {
		ideeller: 'var(--sphere-ideeller)',
		vermoegen: 'var(--sphere-vermoegen)',
		zweckbetrieb: 'var(--sphere-zweckbetrieb)',
		wirtschaftlich: 'var(--sphere-wirtschaftlich)',
	};
</script>

<script lang="ts">
	/**
	 * LockedSphereField — the read-only, kategorie-derived Sphäre (entry-modal-v4
	 * `.locked-field`). The Sphäre is NEVER chosen directly (ADR-0002); it follows
	 * the Kategorie. This field renders the derivation transparently: a colour
	 * swatch + label in a locked box with a lock glyph, plus a plain-language hint.
	 *
	 * There is deliberately NO project-sphere override here — the entry create
	 * path derives the Sphäre strictly from the Kategorie (the project override is
	 * a pre-Festschreibung admin correction on the detail view, not an entry field).
	 */
	// `Sphere` is imported in the module <script> above and is in scope here.
	import { SPHERE_LABELS } from '$lib/domain/sphere.js';
	import LockIcon from '@lucide/svelte/icons/lock';

	interface Props {
		/** The derived sphere (from the chosen Kategorie). */
		sphere: Sphere;
		/** The field label (default "Sphäre"). */
		label?: string;
		/** The derivation hint under the box. */
		hint?: string;
	}

	let {
		sphere,
		label = 'Sphäre',
		hint = 'Aus der Kategorie abgeleitet — nicht direkt wählbar.',
	}: Props = $props();

	const sphereLabel = $derived(SPHERE_LABELS[sphere]);
</script>

<div class="flex flex-col gap-1.5" data-slot="locked-sphere-field">
	<span class="text-sm font-medium text-ink-900">{label}</span>
	<div
		class="flex h-11 min-h-11 items-center justify-between rounded-[10px] border border-hairline bg-secondary/60 px-3"
		data-slot="locked-field"
		data-sphere={sphere}
	>
		<span class="flex items-center gap-2 text-sm font-medium text-ink-900">
			<span
				class="size-2.5 shrink-0 rounded-full"
				style="background: {SPHERE_SWATCH_VAR[sphere]}"
				aria-hidden="true"
			></span>
			{sphereLabel}
		</span>
		<LockIcon class="size-4 shrink-0 text-ink-500" aria-hidden="true" />
	</div>
	<span class="text-xs text-ink-500">{hint}</span>
</div>
