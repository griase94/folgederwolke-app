<script lang="ts">
	// AUS-Nr search entry (no param). Same neutral composition as the detail
	// route's 404 body, minus the "we didn't find X" chip — this is a calm
	// look-up start, not an error.
	import { page } from '$app/state';
	import StatusSplitShell from '$lib/components/public/StatusSplitShell.svelte';
	import StatusMedallion from '$lib/components/ui/StatusMedallion.svelte';
	import AusIdSearch from '$lib/components/public/AusIdSearch.svelte';
	import Search from '@lucide/svelte/icons/search';
	import Lock from '@lucide/svelte/icons/lock';
</script>

<svelte:head><title>Auslage-Status verfolgen — {page.data.vereinName}</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-3 py-6 lg:px-6 lg:py-10">
	<StatusSplitShell tone="s404" centerMain>
		{#snippet aside()}
			<div class="flex flex-1 flex-col">
				<StatusMedallion class="mb-4" tone="s404" size="lg">{#snippet icon()}<Search />{/snippet}</StatusMedallion>
				<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">Status verfolgen</span>
				<h1 class="mt-2 max-w-[342px] text-[25px] leading-tight font-extrabold tracking-tight text-ink-900">Wo steht deine Erstattung?</h1>
				<p class="mt-3 max-w-[332px] text-[13.5px] leading-relaxed text-ink-700">
					Gib deine AUS-Nummer ein — dann zeigen wir dir sofort den Stand. Ohne Login, ohne Umwege.
				</p>
				<div class="mt-auto flex items-center gap-2 pt-5 text-[12px] font-semibold text-type-einnahme [&_svg]:size-4">
					<Lock aria-hidden="true" />Nur wer die Nummer hat, sieht den Stand — Kontodaten bleiben verdeckt.
				</div>
			</div>
		{/snippet}
		{#snippet main()}
			<AusIdSearch contactEmail={page.data.kontaktEmail ?? null} />
		{/snippet}
	</StatusSplitShell>
</main>
