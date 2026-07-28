<!--
	BelegLine — the receipt row under the status facts (Aurora A-flow S1, plate
	`.beleg-line`). Icon tile + filename (+ optional meta). The public status page
	renders it WITHOUT a thumbnail and WITHOUT an "Ansehen" link: the Beleg-thumb
	endpoint is deferred (no new public media surface — ruling), so the public
	receipt shows the filename only. `viewHref` is the seam for the authed portal
	(S2) to add "Ansehen" once a scoped file endpoint exists.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import Receipt from '@lucide/svelte/icons/receipt';
	import FileText from '@lucide/svelte/icons/file-text';

	export interface BelegLineProps {
		fileName: string;
		/** Short meta line (e.g. "JPG"); omit to hide. */
		meta?: string | null;
		/** Authed "Ansehen" link (portal only). Public passes none. */
		viewHref?: string | null;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		fileName,
		meta,
		viewHref,
		class: className,
		'data-testid': testId = 'beleg-line'
	}: BelegLineProps = $props();
</script>

<div
	class={cn(
		'flex items-center gap-3 rounded-[12px] border border-hairline bg-secondary/40 px-3 py-2.5',
		className
	)}
	data-testid={testId}
	data-slot="beleg-line"
>
	<span
		class="grid size-9 flex-none place-items-center rounded-[9px] bg-card text-ink-500 shadow-[var(--shadow-card)] [&_svg]:size-4.5"
		aria-hidden="true"
	>
		<Receipt />
	</span>
	<span class="flex min-w-0 flex-1 flex-col">
		<span class="truncate text-[13px] font-semibold text-ink-900">{fileName}</span>
		{#if meta}<span class="text-[11px] text-ink-500">{meta}</span>{/if}
	</span>
	{#if viewHref}
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={viewHref}
			class="inline-flex flex-none items-center gap-1.5 rounded-[9px] border border-hairline bg-card px-3 py-1.5 text-xs font-semibold text-primary-text transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5"
		>
			<FileText aria-hidden="true" />Ansehen
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}
</div>
