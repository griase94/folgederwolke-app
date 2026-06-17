<script lang="ts">
	/**
	 * LockBanner — Festschreibung lock surface (master §2.6, spec §9.2,
	 * ADR-0006). One consistent banner wherever a closed Buchungsjahr blocks
	 * mutation; pair with LockChip replacing the mutating controls.
	 */
	let { year }: { year: number } = $props();
</script>

<div
	role="status"
	data-testid="lock-banner"
	class="flex items-center gap-3 rounded-2xl border border-hairline bg-secondary px-4 py-3"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="shrink-0 text-ink-500"
		aria-hidden="true"
	>
		<rect x="3" y="11" width="18" height="11" rx="2" />
		<path d="M7 11V7a5 5 0 0 1 10 0v4" />
	</svg>
	<p class="text-sm text-ink-700">
		<span class="font-semibold text-ink-900">Buchungsjahr {year} ist festgeschrieben.</span>
		Einträge aus diesem Jahr können nicht mehr geändert werden (GoBD).
	</p>
</div>
