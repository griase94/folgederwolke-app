<script lang="ts">
	import { Receipt } from '@lucide/svelte';
	import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte';
	import MemberAuslageRow from '$lib/components/portal/MemberAuslageRow.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// `data` merges the portal layout load (member) with this page load (auslagen).
	const vorname = $derived(data.member.vorname);
	const auslagen = $derived(data.auslagen);
</script>

<svelte:head>
	<title>Mein Portal · {data.member.vorname} {data.member.nachname}</title>
</svelte:head>

<section class="mb-7" data-testid="portal-greeting">
	<h1 class="text-2xl font-semibold tracking-tight text-ink-900">
		Servus, {vorname} — schön, dass du da bist.
	</h1>
	<p class="mt-1.5 text-sm text-ink-600">
		Hier siehst du deine eingereichten Auslagen und wo sie gerade stehen.
	</p>
</section>

<section aria-labelledby="meine-auslagen-heading">
	<div class="mb-3 flex items-center gap-2">
		<h2 id="meine-auslagen-heading" class="text-base font-semibold text-ink-900">
			Meine Auslagen
		</h2>
		{#if auslagen.length > 0}
			<span
				class="grid min-w-6 place-items-center rounded-full bg-secondary px-1.5 text-xs font-semibold text-ink-600 tabular-nums"
				data-testid="portal-auslagen-count">{auslagen.length}</span
			>
		{/if}
	</div>

	{#if auslagen.length === 0}
		<EmptyState
			data-testid="portal-auslagen-empty"
			title="Noch nichts eingereicht"
			description="Sobald du eine Auslage einreichst, taucht sie hier auf — mit Betrag und Status auf einen Blick."
		>
			{#snippet icon()}
				<Receipt class="size-7" />
			{/snippet}
		</EmptyState>
	{:else}
		<div
			class="border-hairline divide-hairline divide-y overflow-hidden rounded-2xl border bg-card"
			data-testid="portal-auslagen-list"
		>
			{#each auslagen as row (row.businessId)}
				<MemberAuslageRow
					businessId={row.businessId}
					bezeichnung={row.bezeichnung}
					betragCents={row.betragCents}
					rechnungsdatum={row.rechnungsdatum}
					status={row.status}
				/>
			{/each}
		</div>
	{/if}
</section>
