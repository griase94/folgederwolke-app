<script lang="ts">
	import TransactionDetailPanel from '$lib/components/admin/transactions/TransactionDetailPanel.svelte';
	import TransactionEditForm from '$lib/components/admin/transactions/TransactionEditForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.detail.bezeichnung} – Transaktionen – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
	<!-- ── Breadcrumb ──────────────────────────────────────────────────────── -->
	<nav class="mb-6 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/transactions" class="hover:text-foreground">Transaktionen</a>
		<span aria-hidden="true">›</span>
		<span class="text-foreground font-medium truncate max-w-xs">{data.detail.bezeichnung}</span>
	</nav>

	<div class="grid gap-8 lg:grid-cols-[1fr_360px]">
		<!-- ── Detail panel ─────────────────────────────────────────────────── -->
		<div class="rounded-xl border border-border bg-background p-6 shadow-sm">
			<TransactionDetailPanel
				detail={data.detail}
				zahlungsarten={data.zahlungsarten}
				isFestgeschrieben={data.isFestgeschrieben}
			/>
		</div>

		<!-- ── Edit form ────────────────────────────────────────────────────── -->
		<div class="rounded-xl border border-border bg-background p-6 shadow-sm">
			<h2 class="mb-4 text-sm font-semibold text-foreground">
				{data.isFestgeschrieben ? 'Details' : 'Bearbeiten'}
			</h2>
			<TransactionEditForm
				detail={data.detail}
				zahlungsarten={data.zahlungsarten}
				isFestgeschrieben={data.isFestgeschrieben}
			/>
		</div>
	</div>

	<div class="mt-6">
		<Button href="/app/transactions" variant="ghost" size="sm">
			← Zurück zur Liste
		</Button>
	</div>
</div>
