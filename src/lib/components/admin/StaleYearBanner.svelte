<script lang="ts">
	/**
	 * StaleYearBanner — Task 3, Phase 3.
	 *
	 * Renders a non-dismissible amber status banner when the user is viewing a
	 * concrete year that is not the current Buchungsjahr. Suppressed for
	 * ALL_YEARS ("all") — isStaleYear returns false for the sentinel.
	 *
	 * Resolves: spec §6 — stale-year affordance.
	 */
	import { isStaleYear } from '$lib/domain/year.js';
	import type { YearScope } from '$lib/domain/year.js';

	interface Props {
		selectedYear: YearScope;
		currentYear: number;
	}

	let { selectedYear, currentYear }: Props = $props();

	const stale = $derived(isStaleYear(selectedYear, currentYear));
</script>

{#if stale}
	<div
		role="status"
		class="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="size-4 shrink-0"
			aria-hidden="true"
		>
			<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
			<line x1="12" y1="9" x2="12" y2="13" />
			<line x1="12" y1="17" x2="12.01" y2="17" />
		</svg>
		<span>Ansicht: {selectedYear} — nicht das laufende Jahr</span>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- query-only nav (?year=NNNN) on the current route, not a typed route id -->
		<a
			href="?year={currentYear}"
			class="ml-auto shrink-0 underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
		>
			Zu {currentYear} wechseln
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
{/if}
