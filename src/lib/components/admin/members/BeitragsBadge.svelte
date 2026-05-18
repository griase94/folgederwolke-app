<script lang="ts">
	import type { BeitragStatus } from '$lib/domain/members.js';

	let {
		year,
		status,
		compact = false
	}: {
		year: number;
		status: BeitragStatus;
		compact?: boolean;
	} = $props();

	const label: Record<BeitragStatus, string> = {
		paid: 'bezahlt',
		open: 'offen',
		waived: 'erlassen'
	};

	const classes: Record<BeitragStatus, string> = {
		paid: 'bg-green-100 text-green-800 border-green-200',
		open: 'bg-amber-100 text-amber-800 border-amber-200',
		waived: 'bg-gray-100 text-gray-500 border-gray-200'
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {classes[status]}"
	title="{year}: {label[status]}"
>
	{#if status === 'paid'}
		<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
			<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
		</svg>
	{:else if status === 'open'}
		<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
			<circle cx="12" cy="12" r="9" />
		</svg>
	{:else}
		<span class="leading-none">—</span>
	{/if}
	{#if !compact}
		<span>{year}</span>
	{/if}
</span>
