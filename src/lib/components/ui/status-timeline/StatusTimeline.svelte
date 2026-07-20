<!--
	StatusTimeline — the Aurora Verlauf / audit trail (F1 shared primitive).

	A neutral vertical rail with a dot per event (kit §3.16 .tl). States:
	  done    → filled einnahme-green dot (a completed step)
	  now     → hollow dot with a neutral-open ring ("jetzt" / in progress).
	            Status NEVER borrows brand pink (ANDY-LENS §4).
	  reject  → filled sev-critical dot (a rejection / failure step)
	  pending → hollow ink-300 dot (a not-yet-reached step)
	Timestamp is tabular; title is the ink-900 lead. The rail itself is a plain
	hairline — colour lives in the dots, so the trail reads at a glance.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	export type TimelineState = 'done' | 'now' | 'reject' | 'pending';

	export interface TimelineEvent {
		title: string;
		/** Short timestamp / meta line above the title (tabular). */
		timestamp?: string;
		state?: TimelineState;
		/** Optional secondary line under the title. */
		detail?: string;
	}

	export interface StatusTimelineProps {
		events: TimelineEvent[];
		class?: string;
		'data-testid'?: string;
		/** Optional trailing content rendered inside each event's body. */
		children?: Snippet<[TimelineEvent, number]>;
	}

	const dotClass: Record<TimelineState, string> = {
		done: 'bg-type-einnahme border-type-einnahme',
		now: 'bg-card border-neutral-open shadow-[0_0_0_3px_color-mix(in_srgb,var(--neutral-open)_22%,transparent)]',
		reject: 'bg-severity-critical border-severity-critical',
		pending: 'bg-card border-ink-300'
	};
</script>

<script lang="ts">
	let {
		events,
		class: className,
		'data-testid': testId = 'status-timeline',
		children
	}: StatusTimelineProps = $props();
</script>

<ol class={cn('m-0 list-none p-0', className)} data-testid={testId} data-slot="status-timeline">
	{#each events as ev, i (ev.title + i)}
		{@const state = ev.state ?? 'pending'}
		{@const last = i === events.length - 1}
		<li class="relative flex gap-3 pb-5 last:pb-0" data-slot="timeline-event" data-state={state}>
			<!-- dot column: dot + rail segment to the next event -->
			<div class="relative flex flex-col items-center pt-0.5">
				<span
					class={cn('size-3.5 shrink-0 rounded-full border-2 box-border', dotClass[state])}
					data-slot="timeline-dot"
					aria-hidden="true"
				></span>
				{#if !last}
					<span class="mt-1 w-0.5 flex-1 bg-hairline" aria-hidden="true"></span>
				{/if}
			</div>
			<!-- body -->
			<div class="min-w-0 flex-1 pb-0.5">
				{#if ev.timestamp}
					<div class="text-[11px] font-semibold tabular-nums text-ink-500">{ev.timestamp}</div>
				{/if}
				<div class="mt-0.5 text-[13px] font-bold text-ink-900">{ev.title}</div>
				{#if ev.detail}
					<div class="mt-0.5 text-xs text-ink-500">{ev.detail}</div>
				{/if}
				{@render children?.(ev, i)}
			</div>
		</li>
	{/each}
</ol>
