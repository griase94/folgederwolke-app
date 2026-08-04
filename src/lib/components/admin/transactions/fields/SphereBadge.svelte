<script lang="ts" module>
	import type { Sphere } from '$lib/domain/sphere.js';

	/**
	 * The §13 sphere palette — the single home for these tokens (lists, detail,
	 * EÜR, dashboard reuse this component). Light bg / dark text per spec §13:
	 *   Ideeller      pink   (#fce7f3 / #9d174d)
	 *   Vermögen      blue   (#eff6ff / #1e3a8a)
	 *   Zweckbetrieb  purple (#ede9fe / #5b21b6)
	 *   Wirtschaftlich amber (#fef3c7 / #92400e)
	 * Expressed via explicit Tailwind utilities (the spec hex values map to these
	 * tokens) + a dark-mode inversion that keeps contrast legible.
	 */
	export const SPHERE_BADGE_CLASSES: Record<Sphere, string> = {
		ideeller:
			'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200', // #fce7f3 / #9d174d
		vermoegen:
			'bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-200', // #eff6ff / #1e3a8a
		zweckbetrieb:
			'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200', // #ede9fe / #5b21b6
		wirtschaftlich:
			'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200', // #fef3c7 / #92400e
	};

	/**
	 * The same §13 identity as a solid swatch, for dense surfaces that show a
	 * dot + label instead of a pill (Buchungsliste, Sphären-Matrix,
	 * LockedSphereField): at 10px the badge tint is invisible, so the dot takes
	 * the saturated member of the SAME hue family.
	 *
	 * Sphere dots MUST come from here. The `--sphere-*` CSS variables are the
	 * dataviz series palette; they do not carry the §13 hues (ideeller renders
	 * green there, i.e. identical to `--type-einnahme`), so using them for a
	 * sphere chip silently states a different identity than the badge next to it.
	 */
	export const SPHERE_DOT_CLASSES: Record<Sphere, string> = {
		ideeller: 'bg-pink-600 dark:bg-pink-400',
		vermoegen: 'bg-blue-600 dark:bg-blue-400',
		zweckbetrieb: 'bg-violet-600 dark:bg-violet-400',
		wirtschaftlich: 'bg-amber-600 dark:bg-amber-400',
	};
</script>

<script lang="ts">
	// `Sphere` is imported in the module <script> above and is in scope here.
	import { SPHERE_LABELS as LABELS } from '$lib/domain/sphere.js';

	let {
		sphere,
		variant = 'badge',
		class: className,
	}: { sphere: Sphere; variant?: 'badge' | 'dot'; class?: string } = $props();

	const label = $derived(LABELS[sphere]);
	const tone = $derived(SPHERE_BADGE_CLASSES[sphere]);
</script>

{#if variant === 'dot'}
	<span
		data-slot="sphere-dot"
		data-sphere={sphere}
		class={['inline-flex min-w-0 items-center gap-2 text-xs text-ink-700', className]
			.filter(Boolean)
			.join(' ')}
	>
		<span
			class={['size-2.5 shrink-0 rounded-sm', SPHERE_DOT_CLASSES[sphere]].join(' ')}
			aria-hidden="true"
		></span>
		<span class="truncate">{label}</span>
	</span>
{:else}
	<span
		data-slot="sphere-badge"
		data-sphere={sphere}
		class={[
			'inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
			tone,
			className,
		]
			.filter(Boolean)
			.join(' ')}
	>
		{label}
	</span>
{/if}
