<script lang="ts">
	import { cn } from "$lib/utils.js";

	let {
		label,
		value,
		onRemove,
		class: className,
	}: {
		label: string;
		value: string;
		onRemove: () => void;
		class?: string;
	} = $props();

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === "Backspace" || e.key === "Delete") {
			e.preventDefault();
			onRemove();
		}
	}
</script>

<!--
  Filter chip: shows "label · value" with a removable × button.
  – The × button carries an accessible aria-label for screen readers.
  – The 44px tap target comes from an ::after overlay, NOT from the button box:
    a min-h-11/min-w-11 button inside a py-0.5 pill inflated every chip to 44px
    tall with a 44px blank tail, which is what made an active chip row look
    broken beside the toolbar (spec §3).
  – Backspace / Delete when focused also fires onRemove (A3-01).
-->
<span
	data-slot="filter-chip"
	class={cn(
		"inline-flex items-center gap-1.5 rounded-full border border-hairline bg-secondary py-1 pl-3 pr-2 text-[13px]",
		className
	)}
>
	<span class="text-ink-500">{label}</span>
	<span class="font-medium text-ink-900">{value}</span>
	<button
		type="button"
		aria-label="{label}: {value} entfernen"
		class="relative flex size-5 items-center justify-center rounded-full text-ink-500 transition-colors after:absolute after:-inset-3 after:content-[''] hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		onclick={onRemove}
		onkeydown={onKeyDown}
	>
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
		>
			<line x1="2" y1="2" x2="10" y2="10" />
			<line x1="10" y1="2" x2="2" y2="10" />
		</svg>
	</button>
</span>
