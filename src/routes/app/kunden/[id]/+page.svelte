<script lang="ts">
	import CustomerInfoCard from '$lib/components/admin/customers/CustomerInfoCard.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.customer.name} – Kunden – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<!-- Breadcrumb -->
	<nav class="mb-4 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Brotkrümel">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/kunden" class="flex items-center gap-1 rounded hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Kunden
		</a>
		<span aria-hidden="true">/</span>
		<span class="truncate font-medium text-foreground">{data.customer.name}</span>
	</nav>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
		<!-- Left: Info card -->
		<div class="lg:sticky lg:top-4 lg:self-start">
			<CustomerInfoCard customer={data.customer} />
		</div>

		<!-- Right: placeholder for linked invoices (future) -->
		<div class="flex flex-col gap-4">
			<div class="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
				<svg
					class="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				<p class="text-sm text-muted-foreground">
					Verknüpfte Rechnungen werden in einem späteren Release angezeigt.
				</p>
			</div>
		</div>
	</div>
</div>
