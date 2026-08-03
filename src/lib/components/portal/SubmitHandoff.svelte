<!--
	SubmitHandoff — the in-shell confirmation after a member submits
	(Aurora A-flow S2b, brief auslage-einreichen-member §1.9 / State 6).

	The member stays INSIDE the portal shell: no redirect onto the public
	split-card. Composed entirely from shipped primitives — StatusMedallion,
	AusIdCard / BatchConfirmGroup, StatusTimeline — so the receipt a member sees
	and the one an external submitter sees are the same object in two frames.

	Single submission → one AusIdCard. Batch → the group + total, because every
	Auslage gets its own number and that promise has to be visible.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import StatusMedallion from '$lib/components/ui/StatusMedallion.svelte';
	import AusIdCard from '$lib/components/public/AusIdCard.svelte';
	import BatchConfirmGroup, {
		type BatchConfirmItem
	} from '$lib/components/public/BatchConfirmGroup.svelte';
	import StatusTimeline, {
		type TimelineEvent
	} from '$lib/components/ui/status-timeline/StatusTimeline.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

	/** A batch row, plus the Beleg filename the single-card receipt names. */
	export interface HandoffItem extends BatchConfirmItem {
		belegName?: string | null;
	}

	export interface SubmitHandoffProps {
		vorname: string;
		items: HandoffItem[];
		gesamtCents: number;
		/** Status surface for this submission / group. */
		statusHref: string;
		/** Back to the portal home. */
		uebersichtHref?: string;
		class?: string;
		'data-testid'?: string;
	}

	/** What happens next — the same three beats the confirmation mail promises. */
	const HANDOFF_TIMELINE: TimelineEvent[] = [
		{ title: 'Eingereicht', detail: 'Wir haben alles bekommen.', state: 'done' },
		{ title: 'Der Vorstand schaut drauf', detail: 'Meist innerhalb weniger Tage.', state: 'now' },
		{ title: 'Geld kommt zurück', detail: 'Auf dein hinterlegtes Konto.', state: 'pending' }
	];
</script>

<script lang="ts">
	let {
		vorname,
		items,
		gesamtCents,
		statusHref,
		uebersichtHref = '/portal',
		class: className,
		'data-testid': testId = 'submit-handoff'
	}: SubmitHandoffProps = $props();

	const isBatch = $derived(items.length > 1);
	const single = $derived(items[0]);
</script>

<section
	class={cn('flex flex-col items-center text-center', className)}
	data-testid={testId}
	data-slot="submit-handoff"
	aria-labelledby="handoff-heading"
>
	<StatusMedallion class="mb-5" tone="done" size="lg">
		{#snippet icon()}<CircleCheck />{/snippet}
	</StatusMedallion>

	<h1 id="handoff-heading" class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">
		Hat geklappt, {vorname}!
	</h1>
	<p class="mt-1.5 text-sm text-ink-500">
		{#if isBatch}
			Deine {items.length} Auslagen sind beim Vorstand — jede mit ihrer eigenen Nummer.
		{:else}
			Deine Auslage ist beim Vorstand.
		{/if}
	</p>

	<div class="mt-5 w-full">
		{#if isBatch}
			<BatchConfirmGroup {items} {gesamtCents} />
		{:else if single}
			<AusIdCard
				ausId={single.ausId}
				betragCents={single.betragCents}
				belegName={single.belegName ?? null}
			/>
		{/if}
	</div>

	<div class="mt-6 w-full text-left">
		<h2 class="mb-3 text-sm font-semibold text-ink-900">Was jetzt passiert</h2>
		<StatusTimeline events={HANDOFF_TIMELINE} data-testid="handoff-timeline" />
	</div>

	<div class="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
		<Button href={statusHref} size="cta" data-testid="handoff-status">Status ansehen</Button>
		<Button href={uebersichtHref} variant="ghost" size="cta" data-testid="handoff-uebersicht">
			Zur Übersicht
		</Button>
	</div>
</section>
