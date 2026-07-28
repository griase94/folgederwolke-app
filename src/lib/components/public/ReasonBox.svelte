<!--
	ReasonBox — the rejection reason (Aurora A-flow S1, plate `.reason-box`). The
	heaviest element on the abgelehnt status: a critical-tinted card with an accent
	bar and larger reason text carrying Julia's words 1:1 (`decision_reason`). Warm,
	not alarming — the recovery CTA lives next to it (rendered by the page).
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import User from '@lucide/svelte/icons/user';

	export interface ReasonBoxProps {
		reason: string;
		/** Who decided (e.g. "Julia"); omit to hide the by-line. */
		by?: string | null;
		/** Decision date (formatted); omit to hide. */
		when?: string | null;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		reason,
		by,
		when,
		class: className,
		'data-testid': testId = 'reason-box'
	}: ReasonBoxProps = $props();
</script>

<div
	class={cn(
		'overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--sev-critical)_26%,transparent)] border-l-[3px] border-l-severity-critical bg-severity-critical-tint px-4 py-3.5',
		className
	)}
	data-testid={testId}
	data-slot="reason-box"
>
	<div class="flex items-center gap-2 text-[12px] font-bold tracking-wide text-severity-critical-text uppercase [&_svg]:size-4">
		<CircleX aria-hidden="true" />
		<span>Ablehnungs-Grund</span>
	</div>
	<p class="mt-2 text-[14px] leading-relaxed font-medium text-ink-900" data-testid="reason-box-text">
		{reason}
	</p>
	{#if by || when}
		<div class="mt-2.5 flex items-center gap-1.5 text-[12px] text-ink-500 [&_svg]:size-3.5">
			<User aria-hidden="true" />
			{#if by}<span>von {by}</span>{/if}
			{#if when}<span class="ml-auto tabular-nums">{when}</span>{/if}
		</div>
	{/if}
</div>
