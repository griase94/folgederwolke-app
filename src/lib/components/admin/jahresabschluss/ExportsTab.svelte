<!--
	ExportsTab — the Jahresabschluss download hub (D-Flow §2.5, plate
	ja-exports-v1). D5a: ALL downloads consolidated here.

	  · Links (Hero): Paket-Karte mit Inhalts-Manifest (ExportManifestLine aus der
	    single-source bundleManifest — nie ein hartkodierter Dateiname) + ZIP-CTA
	    (Zustandsmaschine idle→generating; .btn-primary NUR im festgeschriebenen
	    Jahr, sonst Ghost + Zwischenstand-Hinweis) + Dauer-Hinweis.
	  · Rechts (Rail): Einzel-Downloads (eur.pdf · transactions.csv · GoBD ansehen)
	    + GobdTrustBlock (nur festgeschrieben — dann existiert der SHA-Anker).
-->
<script lang="ts" module>
	import type { BundleManifestEntry } from '$lib/server/eur/bundle-manifest.js';

	export interface ExportsTabProps {
		year: number;
		closed: boolean;
		spendenCount: number;
		hasBuchungen: boolean;
		manifest: BundleManifestEntry[];
		/** festgeschrieben am · durch wen — only present for a sealed year. */
		festMeta?: { festgeschriebenAm: string | null; festgeschriebenBy: string | null } | null;
	}
</script>

<script lang="ts">
	import ExportManifestLine from './ExportManifestLine.svelte';
	import GobdTrustBlock from './GobdTrustBlock.svelte';
	import Info from '@lucide/svelte/icons/info';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import FileCode from '@lucide/svelte/icons/file-code';
	import Package from '@lucide/svelte/icons/package';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let {
		year,
		closed,
		spendenCount,
		hasBuchungen,
		manifest,
		festMeta = null
	}: ExportsTabProps = $props();

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	const bundleUrl = $derived(`/app/jahresabschluss/${year}/bundle.zip`);
	const gobdUrl = $derived(`/app/jahresabschluss/${year}/gobd-export`);

	let generating = $state(false);
	function onZipClick(e: MouseEvent) {
		if (!hasBuchungen) {
			e.preventDefault();
			return;
		}
		if (generating) {
			// double-submit guard while the browser prepares the stream
			e.preventDefault();
			return;
		}
		generating = true;
		// The download streams; we can't observe its start, so reset after a
		// generous window (no fake progress bar).
		setTimeout(() => (generating = false), 8000);
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
	<!-- Paket-Karte (Hero) -->
	<section class="paket" aria-labelledby="paket-head">
		<div class="paket-head">
			<h2 id="paket-head" class="paket-title">Steuerberater-Paket {year}</h2>
			<p class="paket-sub">
				Ein ZIP mit EÜR, Anlage Gem, Spendenliste ({spendenCount} Spende{spendenCount === 1
					? ''
					: 'n'}), Beleg-Index und GoBD-Z3-Export.
			</p>
		</div>

		{#if !closed}
			<div class="callout info" role="status" data-testid="exports-zwischenstand">
				<Info class="size-4 flex-none" aria-hidden="true" />
				<p>{year} ist noch nicht festgeschrieben — dieser Export ist ein Zwischenstand.</p>
			</div>
		{/if}

		<ul class="manifest" data-testid="exports-manifest">
			{#each manifest as entry (entry.no)}
				<li>
					<ExportManifestLine
						filename={entry.path}
						desc={entry.label}
						highlight={entry.highlight}
						badge={entry.highlight ? 'GoBD-Z3' : undefined}
					/>
					{#if entry.highlight}
						<a class="what-link" href={gobdUrl} data-testid="exports-gobd-link">
							Was ist das? <ArrowRight class="size-[14px]" aria-hidden="true" />
						</a>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="zip-row">
			{#if hasBuchungen}
				<a
					class="zip-cta"
					class:is-primary={closed}
					class:is-ghost={!closed}
					href={bundleUrl}
					download={`Jahresabschluss-${year}.zip`}
					onclick={onZipClick}
					aria-busy={generating}
					data-testid="exports-download-bundle"
				>
					{#if generating}
						<LoaderCircle class="size-4 spin" aria-hidden="true" />
						Paket wird gepackt…
					{:else}
						<Package class="size-4" aria-hidden="true" />
						{closed ? 'Steuerberater-Paket herunterladen' : 'Zwischenstand herunterladen'}
					{/if}
				</a>
			{:else}
				<span class="zip-cta is-disabled" aria-disabled="true" data-testid="exports-download-disabled">
					<Package class="size-4" aria-hidden="true" />
					Nichts zu exportieren
				</span>
			{/if}
		</div>
		<p class="dur-hint">
			{#if hasBuchungen}
				Kann bei vielen Belegen bis zu einer Minute dauern.
			{:else}
				Ohne Buchungen gibt es nichts zu exportieren.
			{/if}
		</p>
	</section>

	<!-- Rail: Einzel-Downloads + Trust -->
	<aside class="space-y-4">
		<div class="single-card">
			<h3 class="sc-head">Einzel-Downloads</h3>
			<a
				class="dl-line"
				href={`/app/jahresabschluss/${year}/eur.pdf`}
				data-testid="download-eur-pdf"
				data-sveltekit-reload
			>
				<FileText class="size-4 flex-none" aria-hidden="true" />
				<span>EÜR als PDF</span>
			</a>
			<a
				class="dl-line"
				href={`/app/jahresabschluss/${year}/transactions.csv`}
				data-testid="download-csv"
				data-sveltekit-reload
			>
				<FileSpreadsheet class="size-4 flex-none" aria-hidden="true" />
				<span>Buchungsliste als CSV</span>
			</a>
			<a class="dl-line" href={gobdUrl} data-testid="download-gobd-view">
				<FileCode class="size-4 flex-none" aria-hidden="true" />
				<span>GoBD-Z3 Export ansehen</span>
				<ArrowRight class="size-[14px] ml-auto flex-none text-muted-foreground" aria-hidden="true" />
			</a>
		</div>

		{#if closed}
			<GobdTrustBlock stacked />
			{#if festMeta?.festgeschriebenAm}
				<dl class="fest-meta" data-testid="festgeschrieben-meta">
					<div class="fm-row">
						<dt>Festgeschrieben am</dt>
						<dd>{formatDate(festMeta.festgeschriebenAm)}</dd>
					</div>
					{#if festMeta.festgeschriebenBy}
						<div class="fm-row">
							<dt>Durch</dt>
							<dd>{festMeta.festgeschriebenBy}</dd>
						</div>
					{/if}
				</dl>
			{/if}
		{/if}
	</aside>
</div>

<style>
	.paket {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		box-shadow: var(--shadow-card);
		padding: 20px 22px;
	}
	.paket-head {
		margin-bottom: 14px;
	}
	.paket-title {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: var(--ink-900);
	}
	.paket-sub {
		margin: 4px 0 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-500);
	}
	.callout {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 11px 14px;
		border-radius: 10px;
		font-size: 13px;
		line-height: 1.45;
		margin-bottom: 14px;
	}
	.callout p {
		margin: 0;
	}
	.callout.info {
		border: 1px solid color-mix(in srgb, var(--sev-info) 35%, transparent);
		background: color-mix(in srgb, var(--sev-info) 9%, transparent);
		color: var(--ink-700);
	}
	.callout.info :global(svg) {
		color: var(--sev-info);
		margin-top: 1px;
	}
	.manifest {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.manifest > li + li {
		margin-top: 8px;
	}
	.what-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 6px 0 0 46px;
		font-size: 12px;
		font-weight: 650;
		color: var(--primary-text);
		text-decoration: none;
	}
	.what-link:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.zip-row {
		margin-top: 18px;
	}
	.zip-cta {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 11px 20px;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 700;
		text-decoration: none;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	.zip-cta.is-primary {
		background: var(--primary-strong, var(--primary));
		color: var(--primary-foreground);
	}
	.zip-cta.is-primary:hover {
		background: color-mix(in srgb, var(--primary-strong, var(--primary)) 88%, #000);
	}
	.zip-cta.is-ghost {
		border: 1px solid var(--border);
		background: var(--card);
		color: var(--ink-900);
	}
	.zip-cta.is-ghost:hover {
		background: var(--secondary);
	}
	.zip-cta.is-disabled {
		border: 1px solid var(--border);
		background: var(--secondary);
		color: var(--ink-300);
		cursor: not-allowed;
	}
	.zip-cta :global(.spin) {
		animation: zipspin 0.8s linear infinite;
	}
	@keyframes zipspin {
		to {
			transform: rotate(360deg);
		}
	}
	.dur-hint {
		margin: 10px 0 0;
		font-size: 11.5px;
		color: var(--ink-500);
	}

	/* Rail single downloads */
	.single-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-card);
		padding: 14px 16px;
	}
	.sc-head {
		margin: 0 0 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-500);
	}
	.dl-line {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 8px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-900);
		text-decoration: none;
	}
	.dl-line + .dl-line {
		border-top: 1px solid var(--hairline);
	}
	.dl-line:hover {
		background: var(--secondary);
	}
	.dl-line :global(svg) {
		color: var(--ink-500);
	}
	/* festgeschrieben am · durch wen — one label ruler, values right */
	.fest-meta {
		margin: 0;
		padding: 4px 4px 0;
	}
	.fm-row {
		display: grid;
		grid-template-columns: 128px 1fr;
		gap: 12px;
		padding: 7px 0;
		font-size: 12.5px;
	}
	.fm-row + .fm-row {
		border-top: 1px solid var(--hairline);
	}
	.fm-row dt {
		color: var(--ink-500);
		font-weight: 600;
	}
	.fm-row dd {
		margin: 0;
		text-align: right;
		font-weight: 600;
		color: var(--ink-900);
	}
</style>
