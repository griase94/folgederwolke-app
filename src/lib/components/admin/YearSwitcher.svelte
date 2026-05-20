<script lang="ts" module>
	export interface YearSwitcherOption {
		year: number;
		closed: boolean;
	}
</script>

<script lang="ts">
	/**
	 * C2 — Global year switcher (topbar, sticky).
	 *
	 * Renders a segmented control (UI-043 — reuses the C6 <SegmentedControl/>
	 * primitive) of every Buchungsjahr the user can switch into. Closed
	 * (festgeschriebene) years receive a lock-icon overlay and an accessible
	 * "festgeschrieben" suffix in the radio name (UI-009).
	 *
	 * Closed years remain CLICKABLE — they are read-only views (EÜR, list
	 * pages); the DB trigger (ADR-0006) refuses mutating writes. Forms read
	 * the selected year as a HINT only, with `gebucht_am` remaining the
	 * authoritative Buchungsjahr (ADR-0001).
	 *
	 * Resolves: VB-002, JB-001, JB-003, JB-006, UX-010, UI-009, UI-043.
	 */

	import SegmentedControl, {
		type SegmentedOption
	} from '$lib/components/ui/segmented-control/segmented-control.svelte';

	interface Props {
		years: YearSwitcherOption[];
		selected: number;
		onChange: (year: number) => void;
	}

	let { years, selected, onChange }: Props = $props();

	const options = $derived(
		years.map<SegmentedOption>((y) => ({
			value: String(y.year),
			// The label is read by screen-readers via aria-label on each radio.
			// Closed years carry the "festgeschrieben" suffix so SR-users hear
			// the lock state without seeing the icon (UI-009 a11y).
			label: y.closed ? `${y.year} (festgeschrieben)` : String(y.year)
		}))
	);

	function handleChange(value: string) {
		const n = Number.parseInt(value, 10);
		if (Number.isFinite(n)) onChange(n);
	}

	// Lock-icon overlays for closed years — absolutely positioned over each
	// closed segment. The SegmentedControl renders buttons in document order,
	// so we mirror the same order here.
	const closedYears = $derived(years.filter((y) => y.closed));
</script>

<div class="fdw-year-switcher relative inline-flex items-center">
	<SegmentedControl
		{options}
		value={String(selected)}
		onChange={handleChange}
		ariaLabel="Buchungsjahr"
		size="sm"
		data-fdw="year-switcher"
	/>

	{#if closedYears.length > 0}
		<!--
			Lock icons render OUTSIDE the segment buttons (the C6 primitive
			doesn't accept icon slots). We point to each closed year via a
			small absolutely-positioned indicator dot rendered after the
			control. Visual treatment is a tiny lock badge sitting in the
			top-right corner of the switcher. SR-users hear "festgeschrieben"
			via the segment's aria-label.
		-->
		<span class="fdw-year-switcher-locks pointer-events-none ml-1 inline-flex items-center gap-0.5">
			{#each closedYears as cy (cy.year)}
				<svg
					data-testid={`year-lock-${cy.year}`}
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="size-3 text-muted-foreground"
					aria-hidden="true"
				>
					<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
			{/each}
		</span>
	{/if}
</div>
