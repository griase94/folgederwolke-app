<script lang="ts">
	import EinstellungenSignOutEverywhereCard from '$lib/components/admin/EinstellungenSignOutEverywhereCard.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Einstellungen – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-2xl px-4 py-8 sm:px-6">
	<div class="mb-8">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">Einstellungen</h1>
		<p class="mt-0.5 text-sm text-muted-foreground">Konto und Vereinseinstellungen</p>
	</div>

	<!-- ── Konto ────────────────────────────────────────────────────────────── -->
	<section aria-labelledby="section-konto" class="mb-10">
		<h2 id="section-konto" class="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
			Konto
		</h2>
		<div class="space-y-4">
			<!-- Current user info -->
			<div class="rounded-xl border border-border bg-card p-6">
				<h3 class="text-base font-semibold text-foreground">Angemeldet als</h3>
				<p class="mt-1 text-sm text-muted-foreground">{data.user.email}</p>
				{#if data.user.name}
					<p class="mt-0.5 text-sm text-muted-foreground">{data.user.name}</p>
				{/if}
				<p class="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
					{data.user.role}
				</p>
			</div>

			<!-- Sign out everywhere -->
			<EinstellungenSignOutEverywhereCard />
		</div>
	</section>

	<!-- ── Verein ───────────────────────────────────────────────────────────── -->
	<section aria-labelledby="section-verein" class="mb-10">
		<h2 id="section-verein" class="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
			Vereinsdaten {data.verein.name ? '(nur lesend)' : ''}
		</h2>
		{#if data.verein.name}
			<div class="rounded-xl border border-border bg-card divide-y divide-border">
				{#each [
					{ label: 'Name', value: data.verein.name },
					{ label: 'Steuernummer', value: data.verein.steuernummer },
					{ label: 'Vereinsregister', value: data.verein.vr },
					{ label: 'Adresse', value: data.verein.adresse },
					{ label: 'IBAN', value: data.verein.iban },
					{ label: 'BIC', value: data.verein.bic },
					{ label: 'Bank', value: data.verein.bank },
				].filter(row => row.value) as row (row.label)}
					<div class="flex flex-col gap-0.5 px-6 py-3 sm:flex-row sm:items-baseline sm:gap-4">
						<dt class="w-36 shrink-0 text-xs font-medium text-muted-foreground">{row.label}</dt>
						<dd class="text-sm text-foreground font-mono">{row.value}</dd>
					</div>
				{/each}
			</div>
			<p class="mt-2 text-xs text-muted-foreground">
				Vereinsdaten werden über Umgebungsvariablen (<code class="font-mono">VEREIN_*</code>) konfiguriert.
			</p>
		{/if}
		<div class="mt-3">
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href="/app/einstellungen/verein"
				class="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
				data-testid="link-stammdaten"
			>
				Stammdaten bearbeiten →
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</section>

	<!-- ── Konfiguration ────────────────────────────────────────────────────── -->
	<section aria-labelledby="section-konfig" class="mb-10">
		<h2 id="section-konfig" class="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
			Konfiguration (nur lesend)
		</h2>
		<div class="rounded-xl border border-border bg-card divide-y divide-border">
			{#each [
				{ label: 'Mail-Absender', value: data.mailFrom },
				{ label: 'Template-Doc', value: data.templateDocId },
			].filter(row => row.value) as row (row.label)}
				<div class="flex flex-col gap-0.5 px-6 py-3 sm:flex-row sm:items-baseline sm:gap-4">
					<dt class="w-36 shrink-0 text-xs font-medium text-muted-foreground">{row.label}</dt>
					<dd class="truncate text-sm text-foreground font-mono">{row.value}</dd>
				</div>
			{/each}
		</div>
	</section>
</div>
