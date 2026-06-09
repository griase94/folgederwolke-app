<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import EinstellungenSignOutEverywhereCard from '$lib/components/admin/EinstellungenSignOutEverywhereCard.svelte';
	import type { ActionData, PageData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Two-stage hydration: $state has to capture a primitive value, not a
	// reactive reference. Initial value comes from server load; later updates
	// (after form save → invalidate) refresh via the effect below.
	let kassenwaertName = $state<string>('');
	let hydrated = false;
	$effect(() => {
		if (hydrated) return;
		hydrated = true;
		kassenwaertName = data.kassenwaertName;
	});
	let saving = $state(false);
	let saved = $state(false);
	let error = $state<string | null>(null);
</script>

<svelte:head>
	<title>Einstellungen – {page.data.vereinName}</title>
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
						<dd class="text-sm text-foreground font-mono whitespace-pre-line">{row.value}</dd>
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

	<!-- ── Kassenwärt:in (Phase 10 — Rechnungs-Signatur) ──────────────────── -->
	<section aria-labelledby="section-kassen" class="mb-10">
		<h2 id="section-kassen" class="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
			Kassenwärt:in
		</h2>
		<form
			method="POST"
			action="?/saveKassenwaertName"
			use:enhance={() => {
				saving = true;
				saved = false;
				error = null;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'failure') {
						error = (result.data?.['error'] as string | undefined) ?? 'Speichern fehlgeschlagen';
					} else if (result.type === 'success') {
						saved = true;
					}
					await update();
				};
			}}
			class="rounded-xl border border-border bg-card p-6 space-y-4"
		>
			<div class="space-y-1">
				<Label for="kassenwaert-name">Name auf Rechnungen</Label>
				<Input
					id="kassenwaert-name"
					name="kassenwaertName"
					required
					maxlength={200}
					bind:value={kassenwaertName}
					placeholder="z. B. Julia Schwarz"
				/>
				<p class="text-xs text-muted-foreground">
					Erscheint als Unterschrift auf jeder Rechnung — kann ohne Deployment geändert werden.
				</p>
			</div>
			{#if error}
				<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
			{/if}
			{#if saved}
				<p class="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
					Gespeichert.
				</p>
			{/if}
			<div>
				<Button type="submit" disabled={saving}>
					{saving ? 'Wird gespeichert…' : 'Speichern'}
				</Button>
			</div>
		</form>
	</section>

	<!-- ── Konfiguration ────────────────────────────────────────────────────── -->
	<section aria-labelledby="section-konfig" class="mb-10">
		<h2 id="section-konfig" class="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
			Konfiguration (nur lesend)
		</h2>
		<div class="rounded-xl border border-border bg-card divide-y divide-border">
			{#each [
				{ label: 'Mail-Absender', value: data.mailFrom },
			].filter(row => row.value) as row (row.label)}
				<div class="flex flex-col gap-0.5 px-6 py-3 sm:flex-row sm:items-baseline sm:gap-4">
					<dt class="w-36 shrink-0 text-xs font-medium text-muted-foreground">{row.label}</dt>
					<dd class="truncate text-sm text-foreground font-mono">{row.value}</dd>
				</div>
			{/each}
		</div>
	</section>

	<!-- ── Backup-Export ────────────────────────────────────────────────────── -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<section aria-labelledby="section-backup-export" class="mb-10">
		<h2 id="section-backup-export" class="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
			Backup-Export
		</h2>
		<div class="rounded-xl border border-border bg-card p-6 dark:border-border/60 dark:bg-card/40">
			<p class="mb-3 text-sm text-muted-foreground">
				Komplettes Daten-Backup als ZIP (CSV pro Tabelle).
				<strong>Diese ZIP ist KEIN Ersatz für den jahresabschluss-bundle.zip</strong>
				— sie ist ein technischer Lese-Abzug ohne Festschreibungs-Signatur. Für
				die Steuerberater-Übergabe nutze den Jahresabschluss-Export.
			</p>
			<a
				href="/app/einstellungen/backup-export"
				class="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
				data-testid="backup-export-button"
			>
				ZIP herunterladen
			</a>
		</div>
	</section>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</div>

<!-- Keep `form` referenced so SvelteKit knows it's used. -->
{#if form}{/if}
