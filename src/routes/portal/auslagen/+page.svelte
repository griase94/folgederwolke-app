<script lang="ts">
	import { Receipt, Plus, ArrowLeft } from '@lucide/svelte';
	import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte';
	import MemberAuslageRow from '$lib/components/portal/MemberAuslageRow.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
	const auslagen = $derived(data.auslagen);
</script>

<svelte:head><title>Meine Auslagen · Mein Portal</title></svelte:head>

<div class="mb-5 flex flex-wrap items-center gap-2">
	<!-- eslint-disable svelte/no-navigation-without-resolve -- static in-app portal routes -->
	<a
		href="/portal"
		class="inline-flex size-10 items-center justify-center rounded-[10px] text-ink-500 transition-colors hover:bg-secondary hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		aria-label="Zurück zur Übersicht"
		data-testid="auslagen-back"
	>
		<ArrowLeft class="size-[18px]" aria-hidden="true" />
	</a>
	<h1 class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Meine Auslagen</h1>
	<Button
		href="/portal/auslagen/neu"
		size="cta"
		class="ml-auto"
		data-testid="auslagen-einreichen-cta"
	>
		<Plus aria-hidden="true" />
		Auslage einreichen
	</Button>
</div>

{#if auslagen.length === 0}
	<EmptyState
		data-testid="auslagen-empty"
		title="Leg los mit deiner ersten Auslage"
		description="Beleg fotografieren, Betrag eintragen, fertig — den Rest macht der Vorstand."
	>
		{#snippet icon()}
			<Receipt class="size-7" />
		{/snippet}
	</EmptyState>
{:else}
	<div
		class="divide-hairline divide-y overflow-hidden rounded-2xl border border-hairline bg-card"
		data-testid="auslagen-list"
		role="list"
	>
		{#each auslagen as row (row.businessId)}
			<MemberAuslageRow
				businessId={row.businessId}
				bezeichnung={row.bezeichnung}
				betragCents={row.betragCents}
				rechnungsdatum={row.rechnungsdatum}
				status={row.status}
				href="/portal/auslagen/{row.businessId}"
			/>
		{/each}
	</div>
{/if}
