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
	 * (festgeschriebene) years receive a lock icon INSIDE the segment and an
	 * accessible "festgeschrieben" suffix in the radio name (UI-009).
	 *
	 * Closed years remain CLICKABLE — they are read-only views (EÜR, list
	 * pages); the DB trigger (ADR-0006) refuses mutating writes. Forms read
	 * the selected year as a HINT only, with `gebucht_am` remaining the
	 * authoritative Buchungsjahr (ADR-0001).
	 *
	 * Lock positioning (C2-5, cycle 3): originally the lock icons rendered as
	 * a cluster AFTER the segmented control — when 2+ years were closed,
	 * sighted users couldn't tell WHICH year each lock pointed at. We now
	 * pass an `icon` snippet to the SegmentedControl primitive so the lock
	 * sits INSIDE each closed segment.
	 *
	 * allowAllYears (Task 3): list pages may pass this prop to append an
	 * "Alle Jahre" option that navigates to ?year=all (ALL_YEARS sentinel).
	 *
	 * Resolves: VB-002, JB-001, JB-003, JB-006, UX-010, UI-009, UI-043, C2-5.
	 */

	import SegmentedControl, {
		type SegmentedOption
	} from '$lib/components/ui/segmented-control/segmented-control.svelte';
	import { ALL_YEARS, type YearScope } from '$lib/domain/year.js';

	interface Props {
		years: YearSwitcherOption[];
		selected: YearScope;
		onChange: (year: YearScope) => void;
		allowAllYears?: boolean;
	}

	let { years, selected, onChange, allowAllYears = false }: Props = $props();

	const options = $derived((): SegmentedOption[] => {
		const base = years.map<SegmentedOption>((y) => ({
			value: String(y.year),
			// The label is read by screen-readers via aria-label on each radio.
			// Closed years carry the "festgeschrieben" suffix so SR-users hear
			// the lock state without seeing the icon (UI-009 a11y).
			label: y.closed ? `${y.year} (festgeschrieben)` : String(y.year),
			// Closed years get a lock icon snippet — rendered INSIDE the
			// segment by the primitive (C2-5).
			icon: y.closed ? lockIcon : undefined
		}));
		if (allowAllYears) {
			base.push({ value: ALL_YEARS, label: 'Alle Jahre' });
		}
		return base;
	});

	function handleChange(value: string) {
		// Pass the "all" sentinel through verbatim — do NOT parseInt it (that
		// would coerce "all" to NaN, silently dropping the navigation).
		if (value === ALL_YEARS) {
			onChange(ALL_YEARS);
			return;
		}
		const n = Number.parseInt(value, 10);
		if (Number.isFinite(n)) onChange(n);
	}
</script>

{#snippet lockIcon(value: string)}
	<svg
		data-testid={`year-lock-${value}`}
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="size-3 shrink-0 text-muted-foreground"
		aria-hidden="true"
	>
		<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
		<path d="M7 11V7a5 5 0 0 1 10 0v4" />
	</svg>
{/snippet}

<div class="fdw-year-switcher relative inline-flex items-center">
	<SegmentedControl
		options={options()}
		value={String(selected)}
		onChange={handleChange}
		ariaLabel="Buchungsjahr"
		size="sm"
		data-fdw="year-switcher"
	/>
</div>
