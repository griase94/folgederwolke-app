<script lang="ts">
	/**
	 * LockChip — compact festschreibung indicator (master §2.6, spec §9.2).
	 * Replaces a mutating control on locked records; the explanation lives
	 * in the page-level LockBanner.
	 */
	let { label = 'Festgeschrieben' }: { label?: string } = $props();
</script>

<span
	data-testid="lock-chip"
	class="inline-flex items-center gap-1 rounded-full border border-hairline bg-secondary px-2 py-0.5 text-[11px] font-medium text-ink-500"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="11"
		height="11"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<rect x="3" y="11" width="18" height="11" rx="2" />
		<path d="M7 11V7a5 5 0 0 1 10 0v4" />
	</svg>
	{label}
</span>
