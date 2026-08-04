<script lang="ts">
	/**
	 * Member Auslage detail. Composed from the SHARED status kit — the facts,
	 * timeline and copy are built by `buildNodeDetail`, exactly like the public
	 * status page. Only the recovery CTA differs: a member re-submits inside the
	 * portal, not through the public form.
	 */
	import { ArrowLeft } from '@lucide/svelte';
	import StatusMedallion from '$lib/components/ui/StatusMedallion.svelte';
	import AuslageStatusDetail from '$lib/components/public/AuslageStatusDetail.svelte';
	import {
		buildNodeDetail,
		buildSingleAside
	} from '$lib/components/auslagen/status-detail-builder.js';
	import { statusPresentation } from '$lib/components/auslagen/status-presentation.js';
	import Clock from '@lucide/svelte/icons/clock';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const node = $derived(data.node);
	const aside = $derived(buildSingleAside(node));
	const detail = $derived(
		buildNodeDetail(node, { recoveryHref: '/portal/auslagen/neu' })
	);
	const tone = $derived(statusPresentation(node.status).medallion);
</script>

<svelte:head><title>{node.ausId} · Mein Portal</title></svelte:head>

<div class="mb-5 flex items-center gap-2">
	<!-- eslint-disable svelte/no-navigation-without-resolve -- static in-app portal routes -->
	<a
		href="/portal"
		class="inline-flex size-10 items-center justify-center rounded-[10px] text-ink-500 transition-colors hover:bg-secondary hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		aria-label="Zurück zur Übersicht"
		data-testid="detail-back"
	>
		<ArrowLeft class="size-[18px]" aria-hidden="true" />
	</a>
	<span class="text-sm font-semibold tabular-nums text-ink-500" data-testid="detail-aus-id">
		{node.ausId}
	</span>
</div>

<section class="mb-6 flex flex-col items-start" data-testid="detail-hero">
	<StatusMedallion class="mb-4" tone={tone} size="lg">
		{#snippet icon()}
			{#if node.status === 'erstattet'}
				<CircleCheck />
			{:else if node.status === 'abgelehnt'}
				<CircleX />
			{:else if node.status === 'geprueft'}
				<ShieldCheck />
			{:else}
				<Clock />
			{/if}
		{/snippet}
	</StatusMedallion>
	<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">{aside.eyebrow}</span>
	<h1 class="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-ink-900">{aside.headline}</h1>
	<p class="mt-1.5 text-sm leading-relaxed text-ink-500">{aside.sub}</p>
</section>

<AuslageStatusDetail
	factsRows={detail.factsRows}
	beleg={detail.beleg}
	nextStep={detail.nextStep}
	reject={detail.reject}
	recoveryHref={detail.recoveryHref}
	timeline={detail.timeline}
/>

{#if data.belegVerzichtGrund}
	<!-- The Verzicht is part of the record: the member should see what the
	     Vorstand sees when they review it. -->
	<div
		class="mt-4 rounded-2xl border border-hairline bg-secondary px-4 py-3"
		data-testid="detail-verzicht"
	>
		<p class="text-xs font-semibold text-ink-700">Kein Beleg — deine Begründung</p>
		<p class="mt-1 text-sm leading-relaxed text-ink-900">{data.belegVerzichtGrund}</p>
	</div>
{/if}
