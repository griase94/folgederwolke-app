<!--
	AuslageStatusChip — the per-Auslage status pill (Aurora A-flow S1).

	The `.statechip` of the status plate: a small rounded pill that carries a
	single Auslage's fate. ok=green (erstattet), open=brand-neutral (in the
	pipeline — eingegangen/in Prüfung/freigegeben, NEVER amber), crit=red
	(abgelehnt). A leading dot by default; pass an `icon` snippet for the richer
	node/head pill. Distinct from `ui/StatusChip` (the amber incompleteness chip
	"Beleg fehlt") — this one is a status, that one is a data-gap warning.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import type { StatusChipVariant } from '$lib/components/auslagen/status-presentation.js';

	export interface AuslageStatusChipProps {
		variant: StatusChipVariant;
		label: string;
		/** Optional leading glyph; falls back to a tinted dot. */
		icon?: Snippet;
		class?: string;
		'data-testid'?: string;
	}

	const chipClass: Record<StatusChipVariant, string> = {
		ok: 'bg-type-einnahme-tint text-type-einnahme',
		open: 'bg-secondary text-ink-700',
		crit: 'bg-severity-critical-tint text-severity-critical-text'
	};

	const dotClass: Record<StatusChipVariant, string> = {
		ok: 'bg-type-einnahme',
		open: '[background-image:var(--gradient-brand)]',
		crit: 'bg-severity-critical'
	};
</script>

<script lang="ts">
	let {
		variant,
		label,
		icon,
		class: className,
		'data-testid': testId = 'auslage-status-chip'
	}: AuslageStatusChipProps = $props();
</script>

<span
	class={cn(
		'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap [&_svg]:size-3.5',
		chipClass[variant],
		className
	)}
	data-testid={testId}
	data-variant={variant}
	data-slot="auslage-status-chip"
>
	{#if icon}
		{@render icon()}
	{:else}
		<span class={cn('size-1.5 rounded-full', dotClass[variant])} aria-hidden="true"></span>
	{/if}
	{label}
</span>
