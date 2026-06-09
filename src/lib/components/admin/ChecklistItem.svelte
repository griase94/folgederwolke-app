<script lang="ts">
	interface Props {
		label: string;
		/** CTA button label */
		cta: string;
		/** If set, CTA is an <a> link; otherwise a <button> */
		href?: string;
		/** Purely visual badge count — shown before label */
		count?: number;
		/** Called when CTA button is clicked (only used when href is not set) */
		onclick?: () => void;
		/** Shade the item if there's nothing to act on */
		empty?: boolean;
	}

	let { label, cta, href, count, onclick, empty = false }: Props = $props();
</script>

<div
	class="flex items-center gap-4 rounded-lg border border-border bg-card px-5 py-4 shadow-sm transition-opacity {empty
		? 'opacity-50'
		: ''}"
>
	{#if count !== undefined}
		<span
			class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
		>
			{count}
		</span>
	{/if}

	<p class="flex-1 text-sm text-foreground">{label}</p>

	{#if href}
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			{href}
			class="inline-flex min-h-[44px] shrink-0 items-center rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
		>
			{cta}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<button
			type="button"
			{onclick}
			class="inline-flex min-h-[44px] shrink-0 items-center rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
		>
			{cta}
		</button>
	{/if}
</div>
