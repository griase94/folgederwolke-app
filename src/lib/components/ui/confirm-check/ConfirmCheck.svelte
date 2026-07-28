<script lang="ts">
	/**
	 * ConfirmCheck — the friction checkbox that gates a consequential action. A
	 * real checkbox drives it; the box is a styled surrogate. `checked` is
	 * bindable so the parent can gate its button. `tone` sets the checked accent:
	 * `destroy` (red, deletes — the default) or `complete` (green, an irreversible
	 * completion like Festschreibung, D-Flow D2a).
	 */
	import type { Snippet } from "svelte";
	import Check from "@lucide/svelte/icons/check";

	let {
		checked = $bindable(false),
		tone = "destroy",
		children,
	}: {
		checked?: boolean;
		tone?: "destroy" | "complete";
		children: Snippet;
	} = $props();

	const accentClass = $derived(
		tone === "complete"
			? "border-[color:var(--type-einnahme)] bg-[color:var(--type-einnahme)]"
			: "border-[color:var(--sev-critical)] bg-[color:var(--sev-critical)]",
	);
</script>

<label
	class="flex cursor-pointer items-start gap-2.5 rounded-xl border border-hairline bg-secondary/40 px-3.5 py-3 transition-colors hover:bg-secondary/70"
	data-slot="confirm-check"
>
	<input type="checkbox" bind:checked class="sr-only" />
	<span
		class="mt-px grid size-5 shrink-0 place-items-center rounded-[6px] border-2 transition-colors {checked
			? accentClass
			: 'border-hairline bg-card'}"
		aria-hidden="true"
	>
		{#if checked}
			<Check class="size-3.5 text-white" />
		{/if}
	</span>
	<span class="text-[13px] leading-snug text-ink-700">{@render children()}</span>
</label>
