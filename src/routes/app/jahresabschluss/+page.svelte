<script lang="ts">
	import { page } from '$app/state';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Jahresabschluss – {page.data.vereinName}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8 lg:px-8">
	<h1 class="text-2xl font-bold text-foreground">Jahresabschluss</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		EÜR-Zusammenfassung, Bundle-Download und Festschreibung pro Buchungsjahr.
	</p>

	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div class="mt-6 space-y-3">
		{#each data.years as { year, closed } (year)}
			<a
				href="/app/jahresabschluss/{year}"
				class="flex items-center justify-between rounded-xl border border-border bg-card px-6 py-4 shadow-sm transition-colors hover:bg-muted/30"
			>
				<div>
					<div class="text-base font-semibold text-foreground">Buchungsjahr {year}</div>
					{#if closed}
						<div class="mt-0.5 text-xs font-medium text-green-700">Festgeschrieben</div>
					{:else}
						<div class="mt-0.5 text-xs text-muted-foreground">Offen</div>
					{/if}
				</div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-muted-foreground"
					aria-hidden="true"
				>
					<polyline points="9 18 15 12 9 6" />
				</svg>
			</a>
		{/each}

		{#if data.years.length === 0}
			<div class="rounded-xl border border-border bg-muted/20 px-6 py-8 text-center">
				<p class="text-sm text-muted-foreground">Noch keine Buchungen vorhanden.</p>
			</div>
		{/if}
	</div>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</div>
