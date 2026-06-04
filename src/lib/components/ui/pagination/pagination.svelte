<script lang="ts">
	import { cn } from "$lib/utils.js";

	let {
		page,
		pageSize,
		total,
		onPageChange,
		class: className,
	}: {
		page: number;
		pageSize: number;
		total: number;
		onPageChange: (p: number) => void;
		class?: string;
	} = $props();

	const from = $derived((page - 1) * pageSize + 1);
	const to = $derived(Math.min(page * pageSize, total));
	const pages = $derived(Math.ceil(total / pageSize));
</script>

{#if total > pageSize}
	<nav
		data-slot="pagination"
		aria-label="Seitennavigation"
		class={cn("flex items-center gap-2", className)}
	>
		<button
			type="button"
			aria-label="Zurück"
			disabled={page <= 1}
			onclick={() => onPageChange(page - 1)}
			class="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-background px-3 text-sm disabled:pointer-events-none disabled:opacity-50"
		>
			‹ Zurück
		</button>

		<span class="select-none text-sm text-muted-foreground">
			{from}–{to} von {total}
		</span>

		<button
			type="button"
			aria-label="Weiter"
			disabled={page >= pages}
			onclick={() => onPageChange(page + 1)}
			class="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-background px-3 text-sm disabled:pointer-events-none disabled:opacity-50"
		>
			Weiter ›
		</button>
	</nav>
{/if}
