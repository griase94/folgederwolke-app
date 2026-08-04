<script lang="ts">
	import { page } from '$app/state';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import ExportManifestLine from '$lib/components/admin/jahresabschluss/ExportManifestLine.svelte';
	import GobdTrustBlock from '$lib/components/admin/jahresabschluss/GobdTrustBlock.svelte';
	import Info from '@lucide/svelte/icons/info';
	import Package from '@lucide/svelte/icons/package';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import type { PageData } from './$types.js';

	// gobd-export is a DEEPENING of the Exports tab, not a workspace tab itself
	// (flow brief §gobd „kein Workspace-Tab"). It breaks out of the [year] tab
	// layout via +page@app and carries its OWN breadcrumb back to the workspace.
	let { data }: { data: PageData } = $props();

	const bundleUrl = $derived(`/app/jahresabschluss/${data.year}/bundle.zip`);

	let generating = $state(false);
	function onZipClick(e: MouseEvent) {
		if (!data.hasBuchungen) {
			e.preventDefault();
			return;
		}
		if (generating) {
			e.preventDefault();
			return;
		}
		generating = true;
		setTimeout(() => (generating = false), 8000);
	}

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}
</script>

<svelte:head>
	<title>GoBD-Z3 Export {data.year} – {page.data.vereinName}</title>
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<PageShell width="list">
	<nav class="mb-3" aria-label="Brotkrumen">
		<a
			href={`/app/jahresabschluss/${data.year}/exports`}
			class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
			data-testid="gobd-breadcrumb"
		>
			<ChevronLeft class="size-[15px]" aria-hidden="true" />
			Jahresabschluss {data.year}
		</a>
	</nav>

	<div class="mb-5">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">GoBD-Z3 Export {data.year}</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Maschinenlesbarer Export für die Betriebsprüfung — § 147 Abs. 6 AO.
		</p>
	</div>

	{#if !data.closed}
		<div class="callout info" role="status" data-testid="gobd-zwischenstand">
			<Info class="size-4 flex-none" aria-hidden="true" />
			<p>
				{data.year} ist noch nicht festgeschrieben — der Export ist ein Zwischenstand, Zahlen können
				sich noch ändern.
			</p>
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
		<!-- Main -->
		<div class="space-y-5">
			<!-- Manifest + Zähler-Fakten -->
			<section class="panel" aria-labelledby="gobd-manifest-head">
				<h3 id="gobd-manifest-head" class="panel-title">Paket-Inhalt</h3>
				<p class="counts" data-testid="gobd-counts">
					<span class="c ein"
						>{data.counts.einnahmen} {data.counts.einnahmen === 1 ? 'Einnahme' : 'Einnahmen'}</span
					>
					<span class="sep">·</span>
					<span class="c aus"
						>{data.counts.ausgaben} {data.counts.ausgaben === 1 ? 'Ausgabe' : 'Ausgaben'}</span
					>
					<span class="sep">·</span>
					<span class="c spe"
						>{data.counts.spenden} {data.counts.spenden === 1 ? 'Spende' : 'Spenden'}</span
					>
					<span class="sep">·</span>
					<span class="c bei"
						>{data.counts.beitraege}
						{data.counts.beitraege === 1 ? 'Mitgliedsbeitrag' : 'Mitgliedsbeiträge'}</span
					>
				</p>
				<ul class="manifest">
					{#each data.manifest as entry (entry.no)}
						<li>
							<ExportManifestLine
								filename={entry.path}
								desc={entry.label}
								highlight={entry.highlight}
								badge={entry.highlight ? 'GoBD-Z3' : undefined}
							/>
						</li>
					{/each}
				</ul>
				<p class="note">
					Der GoBD-Z3-Export steckt im Paket unter <code>05_GoBD-Z3-{data.year}/</code>.
				</p>
			</section>

			<!-- Format & Schema -->
			<section class="panel" aria-labelledby="gobd-format-head">
				<h3 id="gobd-format-head" class="panel-title">Format &amp; Schema</h3>
				<dl class="facts">
					<div class="f-row"><dt>Format</dt><dd class="mono">IDEA-XML (GDPdU/GoBD Z3, v2.0)</dd></div>
					<div class="f-row"><dt>Zeichensatz</dt><dd class="mono">UTF-8</dd></div>
					<div class="f-row"><dt>Datumsformat</dt><dd class="mono">ISO 8601 (YYYY-MM-DD)</dd></div>
					<div class="f-row">
						<dt>Betragsformat</dt>
						<dd>EUR mit 2 Dezimalstellen (Cents → EUR), Ausgaben negativ</dd>
					</div>
				</dl>
			</section>

			<!-- IDEA-Import-Anleitung -->
			<section class="panel" aria-labelledby="gobd-idea-head">
				<h3 id="gobd-idea-head" class="panel-title">IDEA-Import</h3>
				<ol class="tl">
					<li>
						<span class="tl-no">1</span>
						<span class="tl-txt">
							Entpacke das ZIP — den Ordner <code>05_GoBD-Z3-{data.year}</code> brauchst du gleich.
						</span>
					</li>
					<li>
						<span class="tl-no">2</span>
						<span class="tl-txt">
							Starte IDEA → Datei → Datei importieren → Dateityp XML, Schema Z3 (GDPdU).
						</span>
					</li>
					<li>
						<span class="tl-no">3</span>
						<span class="tl-txt">
							Wähle <code>gobd_z3_{data.year}.xml</code> und prüfe die importierten Buchungen.
						</span>
					</li>
				</ol>
			</section>
		</div>

		<!-- Rail -->
		<aside class="space-y-4">
			<div class="dl-card">
				<h3 class="panel-title">Download</h3>
				{#if data.hasBuchungen}
					<a
						class="zip-cta"
						class:is-primary={data.closed}
						class:is-ghost={!data.closed}
						href={bundleUrl}
						download={`Jahresabschluss-${data.year}.zip`}
						onclick={onZipClick}
						aria-busy={generating}
						data-testid="gobd-download"
					>
						{#if generating}
							<LoaderCircle class="size-4 spin" aria-hidden="true" />
							Paket wird gepackt…
						{:else}
							<Package class="size-4" aria-hidden="true" />
							{data.closed ? 'ZIP herunterladen' : 'Zwischenstand herunterladen'}
						{/if}
					</a>
					<p class="dl-name"><code>Jahresabschluss-{data.year}.zip</code></p>
					<p class="dl-hint">Enthält den GoBD-Z3-Export unter 05_GoBD-Z3-{data.year}/.</p>
				{:else}
					<span class="zip-cta is-disabled" aria-disabled="true" data-testid="gobd-download-disabled">
						<Package class="size-4" aria-hidden="true" />
						Nichts zu exportieren
					</span>
					<p class="dl-hint">Ohne Buchungen gibt es nichts zu exportieren.</p>
				{/if}
			</div>

			{#if data.closed}
				<GobdTrustBlock stacked />
				{#if data.festMeta?.festgeschriebenAm}
					<dl class="fest-meta" data-testid="festgeschrieben-meta">
						<div class="fm-row">
							<dt>Festgeschrieben am</dt>
							<dd>{formatDate(data.festMeta.festgeschriebenAm)}</dd>
						</div>
						{#if data.festMeta.festgeschriebenBy}
							<div class="fm-row">
								<dt>Durch</dt>
								<dd>{data.festMeta.festgeschriebenBy}</dd>
							</div>
						{/if}
					</dl>
				{/if}
			{/if}
		</aside>
	</div>
</PageShell>

<style>
	.callout {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 11px 14px;
		border-radius: 10px;
		font-size: 13px;
		line-height: 1.45;
		margin-bottom: 20px;
		border: 1px solid color-mix(in srgb, var(--sev-info) 35%, transparent);
		background: color-mix(in srgb, var(--sev-info) 9%, transparent);
		color: var(--ink-700);
	}
	.callout p {
		margin: 0;
	}
	.callout :global(svg) {
		color: var(--sev-info);
		margin-top: 1px;
	}
	.panel,
	.dl-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-card);
		padding: 16px 18px;
	}
	.panel-title {
		margin: 0 0 12px;
		font-size: 14px;
		font-weight: 700;
		color: var(--ink-900);
	}
	.counts {
		margin: 0 0 14px;
		font-size: 13px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.counts .c.ein {
		color: var(--type-einnahme);
	}
	.counts .c.aus {
		color: var(--type-ausgabe);
	}
	.counts .c.spe {
		color: var(--type-spende);
	}
	/* Beiträge share the Einnahme hue: they ARE income, and the hue encodes the
	   money direction (S3). Kept as its own class so swapping in a dedicated
	   token later needs no markup change. */
	.counts .c.bei {
		color: var(--type-einnahme);
	}
	.counts .sep {
		color: var(--ink-300);
	}
	.manifest {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.manifest > li + li {
		margin-top: 8px;
	}
	.note {
		margin: 14px 0 0;
		font-size: 12px;
		color: var(--ink-500);
	}
	code {
		font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
		font-size: 0.92em;
		padding: 1px 5px;
		border-radius: 5px;
		background: var(--secondary);
		color: var(--ink-700);
	}
	/* Format facts — one label ruler, values right */
	.facts {
		margin: 0;
	}
	.f-row {
		display: grid;
		grid-template-columns: 128px 1fr;
		gap: 14px;
		padding: 8px 0;
		font-size: 13px;
	}
	.f-row + .f-row {
		border-top: 1px solid var(--hairline);
	}
	.f-row dt {
		color: var(--ink-500);
		font-weight: 600;
	}
	.f-row dd {
		margin: 0;
		color: var(--ink-900);
	}
	.f-row dd.mono {
		font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
		font-size: 12.5px;
	}
	/* IDEA timeline — neutral numbered steps */
	.tl {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.tl li {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.tl-no {
		flex: none;
		width: 24px;
		height: 24px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--secondary);
		border: 1px solid var(--border);
		font-size: 12px;
		font-weight: 700;
		color: var(--ink-700);
	}
	.tl-txt {
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-700);
		padding-top: 2px;
	}
	/* Download CTA */
	.zip-cta {
		display: inline-flex;
		width: 100%;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 11px 18px;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 700;
		text-decoration: none;
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
		animation: gobdspin 0.8s linear infinite;
	}
	@keyframes gobdspin {
		to {
			transform: rotate(360deg);
		}
	}
	.dl-name {
		margin: 10px 0 0;
		text-align: center;
	}
	.dl-hint {
		margin: 8px 0 0;
		font-size: 11.5px;
		color: var(--ink-500);
	}
	/* festgeschrieben am · durch wen */
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
