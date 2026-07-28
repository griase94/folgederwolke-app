<script lang="ts">
	/**
	 * RecipientPager — ‹ Name › preview pager for the Bulk-Reminder sheet
	 * (`.rpager`, erinnerung-senden §4). Steps through the SELECTED recipients
	 * only, always full names (never initials), with a "position/total" readout.
	 * Prev/next via click or ArrowLeft/ArrowRight.
	 */
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	let {
		names,
		index = $bindable(0),
		'data-testid': testId = 'recipient-pager'
	}: {
		/** Full display names of the currently-selected recipients. */
		names: string[];
		/** Bindable current index. */
		index?: number;
		'data-testid'?: string;
	} = $props();

	const count = $derived(names.length);
	// Clamp the index whenever the selection shrinks so we never point past the end.
	$effect(() => {
		if (index > count - 1) index = Math.max(0, count - 1);
	});
	const current = $derived(names[Math.min(index, Math.max(0, count - 1))] ?? '');

	function prev() {
		if (index > 0) index -= 1;
	}
	function next() {
		if (index < count - 1) index += 1;
	}
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			prev();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			next();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- Arrow-key paging over the ‹/› buttons is an intentional group affordance. -->
<div
	data-testid={testId}
	class="inline-flex items-center gap-2"
	role="group"
	aria-label="Vorschau-Empfänger wechseln"
	onkeydown={onKeydown}
>
	<button
		type="button"
		onclick={prev}
		disabled={index <= 0}
		data-testid="{testId}-prev"
		aria-label="Vorherige:r Empfänger:in"
		class="grid h-9 w-9 place-items-center rounded-full text-ink-500 transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<ChevronLeft size={16} aria-hidden="true" />
	</button>

	<span class="min-w-0 text-center">
		<span class="block truncate text-sm font-semibold text-foreground" data-testid="{testId}-name">
			{current}
		</span>
		{#if count > 1}
			<span class="block text-xs tabular-nums text-muted-foreground" data-testid="{testId}-position">
				{Math.min(index + 1, count)}/{count}
			</span>
		{/if}
	</span>

	<button
		type="button"
		onclick={next}
		disabled={index >= count - 1}
		data-testid="{testId}-next"
		aria-label="Nächste:r Empfänger:in"
		class="grid h-9 w-9 place-items-center rounded-full text-ink-500 transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<ChevronRight size={16} aria-hidden="true" />
	</button>
</div>
