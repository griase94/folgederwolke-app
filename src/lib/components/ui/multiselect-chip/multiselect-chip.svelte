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
  – min-w-11 min-h-11 ensures ≥44 px tap target on the remove button.
  – Backspace / Delete when focused also fires onRemove (A3-01).
-->
<span
	data-slot="filter-chip"
	class={cn(
		"inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-sm",
		className
	)}
>
	<span class="text-muted-foreground">{label}</span>
	<span class="font-medium">{value}</span>
	<button
		type="button"
		aria-label="{label}: {value} entfernen"
		class="ml-1 flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
