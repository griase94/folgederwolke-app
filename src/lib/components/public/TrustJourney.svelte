<!--
	TrustJourney — the "1 Du reichst ein · 2 Julia prüft · 3 Geld kommt zurück"
	journey (Aurora A-flow S1, plate `.vsteps` + `.vs-trust`).

	Shared by auslage-einreichen (all steps pending, step 1 = now) and
	auslage-eingereicht (step 1 done ✓, step 2 = now). `doneUntil` is the count of
	COMPLETED steps: steps before it render done (green check), the step AT that
	index renders "now" (brand-highlighted number), the rest pending. A trust line
	sits under the steps. `compact` drops the subtitles for the mobile strip.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import Check from '@lucide/svelte/icons/check';

	export interface JourneyStep {
		title: string;
		subtitle?: string;
	}

	export interface TrustJourneyProps {
		steps: JourneyStep[];
		/** Number of completed steps; the step at this index renders as "now". */
		doneUntil?: number;
		/** Trust line under the steps. */
		trust?: string;
		/** Icon for the trust line (default: shield-check). */
		trustIcon?: Snippet;
		/** Mobile strip: titles only, no subtitles. */
		compact?: boolean;
		class?: string;
		'data-testid'?: string;
	}

	type StepState = 'done' | 'now' | 'pending';
	function stepState(i: number, doneUntil: number): StepState {
		if (i < doneUntil) return 'done';
		if (i === doneUntil) return 'now';
		return 'pending';
	}
</script>

<script lang="ts">
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	let {
		steps,
		doneUntil = 0,
		trust,
		trustIcon,
		compact = false,
		class: className,
		'data-testid': testId = 'trust-journey'
	}: TrustJourneyProps = $props();
</script>

<div
	class={cn(
		'rounded-[16px] border border-hairline bg-[color-mix(in_srgb,var(--card)_60%,transparent)] p-4',
		className
	)}
	data-testid={testId}
	data-slot="trust-journey"
>
	<ol class="m-0 flex list-none flex-col gap-3.5 p-0">
		{#each steps as step, i (step.title)}
			{@const state = stepState(i, doneUntil)}
			<li class="flex items-start gap-3" data-slot="journey-step" data-state={state}>
				<span
					class={cn(
						'grid size-[26px] flex-none place-items-center rounded-full text-[12px] font-bold tabular-nums',
						state === 'done' && 'bg-type-einnahme text-white [&_svg]:size-4',
						state === 'now' &&
							'[background-image:var(--gradient-brand)] text-primary-foreground shadow-[var(--glow-brand)]',
						state === 'pending' && 'bg-secondary text-ink-500'
					)}
					aria-hidden="true"
				>
					{#if state === 'done'}<Check />{:else}{i + 1}{/if}
				</span>
				<div class="min-w-0 flex-1">
					<div class="text-[13px] font-bold text-ink-900">{step.title}</div>
					{#if step.subtitle && !compact}
						<div class="mt-0.5 text-xs leading-snug text-ink-500">{step.subtitle}</div>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
	{#if trust}
		<div
			class="mt-4 flex items-center gap-2 border-t border-hairline pt-3 text-xs font-semibold text-type-einnahme [&_svg]:size-4 [&_svg]:flex-none"
		>
			{#if trustIcon}{@render trustIcon()}{:else}<ShieldCheck />{/if}
			<span>{trust}</span>
		</div>
	{/if}
</div>
