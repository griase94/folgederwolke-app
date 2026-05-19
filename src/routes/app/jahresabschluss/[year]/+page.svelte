<script lang="ts">
	import EurSummary from '$lib/components/admin/jahresabschluss/EurSummary.svelte';
	import BundleDownload from '$lib/components/admin/jahresabschluss/BundleDownload.svelte';
	import FestschreibungConfirm from '$lib/components/admin/jahresabschluss/FestschreibungConfirm.svelte';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Jahresabschluss {data.year} – Folge der Wolke</title>
</svelte:head>

<div class="mx-auto max-w-4xl px-4 py-8 lg:px-8">
	<!-- Page header -->
	<div class="mb-8">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<div class="flex items-center gap-3">
			<a
				href="/app/jahresabschluss"
				class="text-sm text-muted-foreground hover:text-foreground"
				aria-label="Zurück zur Jahresabschluss-Übersicht"
			>
				&larr; Jahresabschluss
			</a>
		</div>
		<h1 class="mt-2 text-2xl font-bold text-foreground">Jahresabschluss {data.year}</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{data.vereinName} &middot; Buchungsjahr {data.year}
			{#if data.closed}
				&middot; <span class="font-medium text-green-700">Festgeschrieben</span>
			{/if}
		</p>
	</div>

	<!-- Action feedback -->
	{#if form?.success}
		<div
			class="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
				<polyline points="22 4 12 14.01 9 11.01" />
			</svg>
			Jahresabschluss {form.year} erfolgreich festgeschrieben — {form.totalRows} Buchung{form.totalRows !==
			1
				? 'en'
				: ''} gesichert.
		</div>
	{/if}

	{#if form?.error}
		<div
			class="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
		>
			{form.error}
		</div>
	{/if}

	<!-- Content grid -->
	<div class="space-y-6">
		<!-- EÜR Summary table -->
		<EurSummary eur={data.eur} />

		<!-- Download bundle -->
		<BundleDownload year={data.year} spendenCount={data.spendenCount} />

		<!-- Festschreibung -->
		<FestschreibungConfirm year={data.year} closed={data.closed} />
	</div>
</div>
