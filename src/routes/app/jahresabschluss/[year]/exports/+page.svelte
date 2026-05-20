<script lang="ts">
	import BundleDownload from '$lib/components/admin/jahresabschluss/BundleDownload.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Exports {data.year} – Jahresabschluss</title>
</svelte:head>

<div class="space-y-5">
	<div class="rounded-xl border border-border bg-card p-5 shadow-sm">
		<h2 class="text-base font-semibold text-foreground">Steuerberater-Paket</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			Konsolidiertes ZIP-Bundle mit EÜR-PDF, Spendenliste, Beleg-Index und GoBD-Z3-Export.
		</p>
		<div class="mt-3.5 flex flex-wrap gap-2">
			<Button
				href={`/app/jahresabschluss/${data.year}/bundle.zip`}
				data-testid="exports-download-bundle"
				class="bg-primary text-primary-foreground hover:bg-primary/90"
			>
				ZIP herunterladen
			</Button>
			<Button
				href={`/app/jahresabschluss/${data.year}/gobd-export`}
				variant="outline"
				data-testid="exports-gobd-link"
			>
				GoBD-Z3 Export ansehen
			</Button>
		</div>
	</div>

	<BundleDownload year={data.year} spendenCount={data.spendenCount} />
</div>
