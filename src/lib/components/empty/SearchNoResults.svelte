<!--
  SearchNoResults — friendly empty state when a search/filter returns nothing.
  Usage: <SearchNoResults query={searchQuery} onClear={() => searchQuery = ''} />
-->
<script lang="ts">
	let {
		query = '',
		onClear
	}: {
		query?: string;
		onClear?: () => void;
	} = $props();
</script>

<div
	class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center"
	role="status"
	aria-live="polite"
	aria-label="Keine Suchergebnisse"
>
	<!-- Search icon -->
	<div
		class="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
		aria-hidden="true"
	>
		<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
			<circle cx="11" cy="11" r="8" />
			<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35" />
		</svg>
	</div>

	<div>
		<p class="text-base font-semibold text-foreground">Keine Ergebnisse</p>
		<p class="mt-1 text-sm text-muted-foreground">
			{#if query}
				Für „<span class="font-medium text-foreground">{query}</span>" wurden keine Treffer gefunden.
			{:else}
				Keine Einträge entsprechen dem aktuellen Filter.
			{/if}
		</p>
	</div>

	{#if onClear}
		<button
			type="button"
			onclick={onClear}
			class="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
		>
			Suche zurücksetzen
		</button>
	{/if}
</div>
