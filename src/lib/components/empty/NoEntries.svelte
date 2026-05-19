<!--
  NoEntries — friendly empty state for lists with no data yet.
  Usage: <NoEntries entity="Mitglieder" hint="Noch keine Mitglieder angelegt." />
         Optionally pass a CTA button via the `action` snippet.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		entity = 'Einträge',
		hint,
		action,
		icon
	}: {
		entity?: string;
		hint?: string;
		/** Optional CTA button or link rendered below the hint text. */
		action?: Snippet;
		/** Optional icon override — defaults to a folder icon. */
		icon?: Snippet;
	} = $props();
</script>

<div
	class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-20 text-center"
	role="status"
	aria-label="Keine {entity}"
>
	<!-- Icon -->
	<div
		class="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
		aria-hidden="true"
	>
		{#if icon}
			{@render icon()}
		{:else}
			<!-- Default: folder outline -->
			<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
				/>
			</svg>
		{/if}
	</div>

	<!-- Text -->
	<div>
		<p class="text-base font-semibold text-foreground">Noch keine {entity}</p>
		<p class="mt-1 text-sm text-muted-foreground">
			{hint ?? `Hier erscheinen ${entity}, sobald welche angelegt wurden.`}
		</p>
	</div>

	<!-- Optional action slot -->
	{#if action}
		<div class="mt-2">
			{@render action()}
		</div>
	{/if}
</div>
