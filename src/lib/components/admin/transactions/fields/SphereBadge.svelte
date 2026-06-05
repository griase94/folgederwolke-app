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
</script>

<script lang="ts">
	// `Sphere` is imported in the module <script> above and is in scope here.
	import { SPHERE_LABELS as LABELS } from '$lib/domain/sphere.js';

	let { sphere }: { sphere: Sphere } = $props();

	const label = $derived(LABELS[sphere]);
	const tone = $derived(SPHERE_BADGE_CLASSES[sphere]);
</script>

<span
	data-slot="sphere-badge"
	data-sphere={sphere}
	class={[
		'inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
		tone,
	].join(' ')}
>
	{label}
</span>
