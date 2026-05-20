<script lang="ts">
	/**
	 * C2 cycle 3 — Mobile (`<sm`) year picker.
	 *
	 * The desktop SegmentedControl YearSwitcher uses `hidden sm:block` because
	 * three or four pill-shaped segments don't fit comfortably next to the
	 * search-icon + bell + user-menu at iPhone-12 width (390px). This compact
	 * native-select alternative renders only below `sm` and shares the `?year=`
	 * URL contract — the topbar's `handleYearChange` handler navigates the same
	 * way regardless of which variant the user touches.
	 *
	 * Native `<select>` is intentional here:
	 *   - Best a11y on touch devices (OS-native picker UX).
	 *   - No dependency added — works without the shadcn-svelte Select primitive.
	 *   - Locks rendered inline as a U+1F512 prefix on closed-year option text.
	 *
	 * Resolves: C2-4 (julia P1 + UX-1 blocker).
	 */

	import type { YearSwitcherOption } from './YearSwitcher.svelte';

	interface Props {
		years: YearSwitcherOption[];
		selected: number;
		onChange: (year: number) => void;
	}

	let { years, selected, onChange }: Props = $props();

	function optionLabel(y: YearSwitcherOption): string {
		// Lock icon inline (Unicode U+1F512) so each closed year is visibly
		// flagged in the OS-native dropdown. SR-users hear "festgeschrieben"
		// from the suffix, which doubles for visual readers as a German label
		// on what the lock means.
		return y.closed ? `\u{1F512} ${y.year} (festgeschrieben)` : String(y.year);
	}

	function handleSelectChange(event: Event) {
		const target = event.currentTarget as HTMLSelectElement;
		const n = Number.parseInt(target.value, 10);
		if (Number.isFinite(n)) onChange(n);
	}
</script>

<div
	class="fdw-year-switcher-mobile relative inline-flex items-center"
	data-fdw="year-switcher-mobile"
>
	<label class="sr-only" for="fdw-year-switcher-mobile-select">Buchungsjahr</label>
	<select
		id="fdw-year-switcher-mobile-select"
		class="h-8 appearance-none rounded-lg border border-border bg-muted/40 py-1 pl-3 pr-7 text-xs font-medium text-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
		aria-label="Buchungsjahr"
		value={String(selected)}
		onchange={handleSelectChange}
	>
		{#each years as y (y.year)}
			<option value={String(y.year)}>{optionLabel(y)}</option>
		{/each}
	</select>
	<!-- Chevron icon — aria-hidden, pointer-events none so the click hits the
	     native <select> behind it. -->
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
		aria-hidden="true"
	>
		<path d="m6 9 6 6 6-6" />
	</svg>
</div>
