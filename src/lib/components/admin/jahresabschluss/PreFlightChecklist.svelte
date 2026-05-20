<script lang="ts" module>
	import type { PreFlightChecklist } from '$lib/server/eur/index.js';

	export interface PreFlightChecklistProps {
		preFlight: PreFlightChecklist;
	}
</script>

<script lang="ts">
	let { preFlight }: PreFlightChecklistProps = $props();

	function iconFor(status: string): { glyph: string; cls: string } {
		if (status === 'pass') return { glyph: '✓', cls: 'text-emerald-600 dark:text-emerald-500' };
		if (status === 'warn') return { glyph: '!', cls: 'text-amber-600 dark:text-amber-400' };
		return { glyph: '✕', cls: 'text-rose-600 dark:text-rose-500' };
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div
	data-testid="preflight-checklist"
	data-can-festschreiben={preFlight.canFestschreiben}
	class="rounded-xl border border-border bg-card p-5 shadow-sm"
>
	<div class="flex items-start justify-between gap-3">
		<div>
			<h3 class="text-sm font-semibold text-foreground">Festschreibungs-Checkliste</h3>
			<p class="mt-1 text-xs text-muted-foreground">
				Vor dem Festschreiben des Jahres bitte prüfen:
			</p>
		</div>
		<div class="text-right text-xs">
			{#if preFlight.canFestschreiben}
				<span
					class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
				>
					Bereit zum Festschreiben
				</span>
			{:else}
				<span
					class="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
				>
					{preFlight.blockers} Blocker
				</span>
			{/if}
		</div>
	</div>

	<ul class="mt-4 space-y-3" role="list">
		{#each preFlight.items as item (item.id)}
			{@const ico = iconFor(item.status)}
			{@const actionable = item.status !== 'pass' && item.fixHref}
			<li
				class="flex items-start gap-3"
				data-testid={`preflight-item-${item.id}`}
				data-status={item.status}
			>
				<span
					aria-hidden="true"
					class={`mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${ico.cls}`}
				>
					{ico.glyph}
				</span>
				{#if actionable}
					<a
						href={item.fixHref}
						class="group min-w-0 flex-1 rounded-md transition hover:bg-accent/40 focus:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring -mx-1 px-1"
						data-testid={`preflight-fix-${item.id}`}
					>
						<div
							class="text-sm font-medium text-foreground group-hover:underline group-focus:underline"
						>
							{item.label}
							<span aria-hidden="true" class="text-muted-foreground"> →</span>
						</div>
						<p class="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
					</a>
				{:else}
					<div class="min-w-0 flex-1">
						<div class="text-sm font-medium text-foreground">{item.label}</div>
						<p class="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</div>
