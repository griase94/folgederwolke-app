<script lang="ts">
	/**
	 * ConfirmCheck — the friction checkbox that gates a destructive red button
	 * (detail-views-v4 `.confirm-check`). A real checkbox drives it; the box is a
	 * styled surrogate. `checked` is bindable so the parent can gate its button.
	 */
	import type { Snippet } from "svelte";
	import Check from "@lucide/svelte/icons/check";

	let {
		checked = $bindable(false),
		children,
	}: { checked?: boolean; children: Snippet } = $props();
</script>

<label
	class="flex cursor-pointer items-start gap-2.5 rounded-xl border border-hairline bg-secondary/40 px-3.5 py-3 transition-colors hover:bg-secondary/70"
	data-slot="confirm-check"
>
	<input type="checkbox" bind:checked class="sr-only" />
	<span
		class="mt-px grid size-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors {checked
			? 'border-[color:var(--sev-critical)] bg-[color:var(--sev-critical)]'
			: 'border-hairline bg-card'}"
		aria-hidden="true"
	>
		{#if checked}
			<Check class="size-3.5 text-white" />
		{/if}
	</span>
	<span class="text-[13px] leading-snug text-ink-700">{@render children()}</span>
</label>
