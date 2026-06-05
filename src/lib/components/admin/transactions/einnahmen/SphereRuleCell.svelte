<script lang="ts" module>
	import type { Sphere } from '$lib/domain/sphere.js';

	/**
	 * §13 Sphäre LEFT COLOR-RULE palette for list rows — a thin left border in the
	 * sphere's accent color (NOT the filled SphereBadge used on detail/forms). The
	 * accent hue mirrors the SphereBadge palette family so the two readings agree.
	 */
	export const SPHERE_RULE_CLASSES: Record<Sphere, string> = {
		ideeller: 'border-pink-400 dark:border-pink-600',
		vermoegen: 'border-blue-400 dark:border-blue-600',
		zweckbetrieb: 'border-violet-400 dark:border-violet-600',
		wirtschaftlich: 'border-amber-400 dark:border-amber-600'
	};
</script>

<script lang="ts">
	/**
	 * Einnahmen Sphäre cell — Phase 5 / Task 2 (spec §13). Renders the Sphäre as a
	 * LEFT color-rule + label rather than a filled badge (the §13 list-row reading;
	 * the filled SphereBadge is reserved for detail/forms).
	 *
	 * `Sphere` is imported in the module <script> above and is in scope here.
	 */
	import { SPHERE_LABELS, SPHERES } from '$lib/domain/sphere.js';

	interface Props {
		/** The row's `sphereSnapshot` — a sphere enum string. */
		sphere: string;
	}

	let { sphere }: Props = $props();

	const isKnown = $derived((SPHERES as readonly string[]).includes(sphere));
	const ruleClass = $derived(isKnown ? SPHERE_RULE_CLASSES[sphere as Sphere] : 'border-border');
	const label = $derived(isKnown ? SPHERE_LABELS[sphere as Sphere] : sphere);
</script>

<span
	data-slot="sphere-rule"
	data-sphere={sphere}
	class={['inline-flex items-center border-l-2 pl-2 text-xs text-muted-foreground', ruleClass].join(
		' '
	)}
>
	{label}
</span>
