<script lang="ts">
	import TaskRow from './TaskRow.svelte';

	let {
		railKind = 'default',
		title = 'Testaufgabe',
		amountCents = undefined,
		ctaLabel = 'Ansehen',
		href = '/app/inbox',
		severity = undefined
	}: {
		railKind?: 'rank1' | 'warn' | 'critical' | 'default';
		title?: string;
		amountCents?: number;
		ctaLabel?: string;
		href?: string;
		severity?: 'warn' | 'critical';
	} = $props();
</script>

<TaskRow {railKind} {title} {amountCents} {ctaLabel} {href} {severity}>
	{#snippet chipIcon()}<span data-testid="chip-content">●</span>{/snippet}
</TaskRow>
