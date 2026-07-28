<!--
	AuslageStatusDetail — one Auslage's detail body (Aurora A-flow S1). Shared by
	the single-status panel (n=1) AND each open node of BatchStatusGroup (n>1) —
	ONE render path (brief: "Einzel = Gruppe mit genau 1 Knoten"). Lays out the
	facts (amount PLUM), the Beleg row, a next-step callout OR the reject
	ReasonBox (+ recovery CTA), and the Verlauf timeline. All data is passed in;
	this is presentation only.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import FactsTable, { type FactRow } from '$lib/components/ui/facts-table/FactsTable.svelte';
	import StatusTimeline, {
		type TimelineEvent
	} from '$lib/components/ui/status-timeline/StatusTimeline.svelte';
	import BelegLine from './BelegLine.svelte';
	import ReasonBox from './ReasonBox.svelte';
	import Callout, { type CalloutTone } from './Callout.svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Clock from '@lucide/svelte/icons/clock';

	export interface NextStep {
		tone: CalloutTone;
		title: string;
		subtitle?: string;
	}

	export interface AuslageStatusDetailProps {
		factsRows: FactRow[];
		beleg?: { fileName: string; meta?: string | null; viewHref?: string | null } | null;
		nextStep?: NextStep | null;
		reject?: { reason: string; by?: string | null; when?: string | null } | null;
		/** Recovery CTA target (rejected only). */
		recoveryHref?: string | null;
		timeline: TimelineEvent[];
		/** Compact fact ruler for the phone (narrower label column). */
		compact?: boolean;
		class?: string;
	}
</script>

<script lang="ts">
	let {
		factsRows,
		beleg,
		nextStep,
		reject,
		recoveryHref,
		timeline,
		compact = false,
		class: className
	}: AuslageStatusDetailProps = $props();
</script>

<div class={cn('flex flex-col', className)} data-slot="auslage-status-detail">
	<FactsTable
		rows={factsRows}
		labelWidth={compact ? '104px' : '164px'}
		class="rounded-[16px] border border-border px-4"
	/>

	{#if beleg}
		<BelegLine class="mt-3" fileName={beleg.fileName} meta={beleg.meta} viewHref={beleg.viewHref} />
	{/if}

	{#if reject}
		<ReasonBox class="mt-5" reason={reject.reason} by={reject.by} when={reject.when} />
		{#if recoveryHref}
			<div class="mt-4">
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={recoveryHref}
					data-testid="reject-recovery-cta"
					class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] [background-image:var(--gradient-brand)] px-5 text-sm font-semibold text-white shadow-[var(--glow-brand)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto [&_svg]:size-4"
				>
					<RefreshCw aria-hidden="true" />Korrigiert neu einreichen
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		{/if}
	{:else if nextStep}
		<Callout
			class="mt-5"
			tone={nextStep.tone}
			title={nextStep.title}
			subtitle={nextStep.subtitle}
		>
			{#snippet icon()}<Clock />{/snippet}
		</Callout>
	{/if}

	<div class="mt-6 mb-3.5 text-[11px] font-bold tracking-wide text-ink-500 uppercase">Verlauf</div>
	<StatusTimeline events={timeline} />
</div>
