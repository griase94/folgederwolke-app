<script lang="ts">
	/**
	 * DetailCard — a rail/workbench card with the plate `.sec-h` eyebrow heading
	 * (icon + uppercase label) above its content. Used for Details/Beleg/Verlauf.
	 */
	import type { Snippet } from "svelte";

	interface Props {
		heading: string;
		icon?: Snippet;
		children: Snippet;
		class?: string;
	}

	let { heading, icon, children, class: klass = "" }: Props = $props();
</script>

<section
	class="rounded-2xl border border-hairline bg-card p-5 shadow-card {klass}"
	data-slot="detail-card"
>
	<div
		class="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-500"
	>
		{#if icon}
			<span class="text-ink-300" aria-hidden="true">{@render icon()}</span>
		{/if}
		<h3>{heading}</h3>
	</div>
	{@render children()}
</section>
