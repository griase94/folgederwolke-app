<script lang="ts">
	import { page } from '$app/state';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const gobdZipUrl = $derived(`/app/jahresabschluss/${data.year}/bundle.zip`);
</script>

<svelte:head>
	<title>GoBD-Export {data.year} – {page.data.vereinName}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8 lg:px-8">
	<!-- Back link -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div class="mb-4">
		<a
			href="/app/jahresabschluss/{data.year}"
			class="text-sm text-muted-foreground hover:text-foreground"
		>
			&larr; Jahresabschluss {data.year}
		</a>
	</div>

	<h1 class="text-2xl font-bold text-foreground">GoBD-Z3 Export {data.year}</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		{data.vereinName} &middot; Steuerberater-Übergabe
	</p>

	<!-- Info card -->
	<div class="mt-6 rounded-xl border border-border bg-card shadow-sm">
		<div class="px-6 py-5">
			<h2 class="text-base font-semibold text-foreground">Inhalt des GoBD-Z3 Exports</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Maschinenlesbarer Buchungsjournal-Export für IDEA-Audit-Software (§ 147 Abs. 6 AO).
			</p>
		</div>

		<!-- Stats -->
		<div class="grid grid-cols-3 divide-x divide-border border-t border-border">
			<div class="px-6 py-4 text-center">
				<div class="text-2xl font-bold text-foreground">{data.counts.einnahmen}</div>
				<div class="text-xs text-muted-foreground">Einnahmen</div>
			</div>
			<div class="px-6 py-4 text-center">
				<div class="text-2xl font-bold text-foreground">{data.counts.ausgaben}</div>
				<div class="text-xs text-muted-foreground">Ausgaben</div>
			</div>
			<div class="px-6 py-4 text-center">
				<div class="text-2xl font-bold text-foreground">{data.counts.spenden}</div>
				<div class="text-xs text-muted-foreground">Spenden</div>
			</div>
		</div>

		<!-- Format details -->
		<div class="border-t border-border/50 px-6 py-4">
			<p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Format</p>
			<ul class="space-y-1 text-xs text-muted-foreground">
				<li>Schema: GDPdU/GoBD Z3, Version 2.0 (BMF 2014-07-14)</li>
				<li>Encoding: UTF-8</li>
				<li>Beträge: EUR mit 2 Dezimalstellen, Ausgaben negativ</li>
				<li>Datumsformat: ISO 8601 (YYYY-MM-DD)</li>
			</ul>
		</div>

		<!-- Download action -->
		<div class="border-t border-border/50 px-6 py-4">
			<p class="mb-3 text-sm text-muted-foreground">
				Der GoBD-Z3 Export ist im vollständigen Jahresabschluss-Bundle enthalten.
			</p>
			<a
				href={gobdZipUrl}
				download="Jahresabschluss-{data.year}.zip"
				class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
				Bundle herunterladen (inkl. GoBD-Z3 XML)
			</a>
		</div>
	</div>

	<!-- IDEA import instructions -->
	<div class="mt-4 rounded-xl border border-border bg-card shadow-sm">
		<div class="px-6 py-5">
			<h2 class="text-base font-semibold text-foreground">IDEA-Import Anleitung</h2>
		</div>
		<div class="border-t border-border/50 px-6 py-4">
			<ol class="space-y-2 text-sm text-muted-foreground">
				<li class="flex gap-3">
					<span class="font-medium text-primary">1.</span>
					Bundle-ZIP herunterladen und entpacken
				</li>
				<li class="flex gap-3">
					<span class="font-medium text-primary">2.</span>
					IDEA starten → Datei → Datei importieren
				</li>
				<li class="flex gap-3">
					<span class="font-medium text-primary">3.</span>
					Dateityp: XML &middot; Schema: Z3 (GDPdU)
				</li>
				<li class="flex gap-3">
					<span class="font-medium text-primary">4.</span>
					Datei auswählen: <code class="rounded bg-muted px-1 text-xs"
						>05_GoBD-Z3-{data.year}/gobd_z3_{data.year}.xml</code
					>
				</li>
			</ol>
		</div>
	</div>
</div>
