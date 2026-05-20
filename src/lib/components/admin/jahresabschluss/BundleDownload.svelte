<script lang="ts">
	interface Props {
		year: number;
		spendenCount: number;
	}

	let { year, spendenCount }: Props = $props();

	const bundleUrl = $derived(`/app/jahresabschluss/${year}/bundle.zip`);
	const gobdUrl = $derived(`/app/jahresabschluss/${year}/gobd-export`);
</script>

<div class="rounded-xl border border-border bg-card shadow-sm">
	<div class="px-6 py-5">
		<h3 class="text-base font-semibold text-foreground">Jahresabschluss-Bundle</h3>
		<p class="mt-1 text-sm text-muted-foreground">
			ZIP-Archiv mit EÜR-PDF, Anlage Gem CSV, Spendenliste ({spendenCount} Spende{spendenCount !==
			1
				? 'n'
				: ''}), Beleg-Index und GoBD-Z3 IDEA-XML.
		</p>
	</div>

	<div class="border-t border-border/50 px-6 py-4">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<div class="flex flex-col gap-3 sm:flex-row">
			<!-- Primary: full bundle ZIP -->
			<a
				href={bundleUrl}
				download="Jahresabschluss-{year}.zip"
				class="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
				Bundle herunterladen (ZIP)
			</a>

			<!-- Secondary: GoBD-Z3 dedicated page -->
			<a
				href={gobdUrl}
				class="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<line x1="16" y1="13" x2="8" y2="13" />
					<line x1="16" y1="17" x2="8" y2="17" />
					<polyline points="10 9 9 9 8 9" />
				</svg>
				GoBD-Z3 Export (Steuerberater)
			</a>
		</div>
	</div>

	<!-- What's inside -->
	<div class="border-t border-border/50 px-6 py-4">
		<p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
			Inhalt des Bundles
		</p>
		<ul class="space-y-1 text-xs text-muted-foreground">
			<li class="flex items-center gap-2">
				<span class="text-primary">01</span> EÜR-{year}.pdf — Einnahmen-Überschuss-Rechnung
			</li>
			<li class="flex items-center gap-2">
				<span class="text-primary">02</span> Anlage-Gem-{year}.csv — Steuerbegünstigte Zwecke
			</li>
			<li class="flex items-center gap-2">
				<span class="text-primary">03</span> Spendenliste-{year}.csv — BMF-Pflichtfelder
			</li>
			<li class="flex items-center gap-2">
				<span class="text-primary">04</span> Beleg-Index-{year}.csv — Drive-Links aller Belege
			</li>
			<li class="flex items-center gap-2">
				<span class="text-primary">05</span> GoBD-Z3-{year}/ — IDEA-XML + README
			</li>
			<li class="flex items-center gap-2">
				<span class="text-primary">06</span> Bescheinigungen-{year}/ — Zuwendungsbestätigungen (PDF)
			</li>
			<li class="flex items-center gap-2">
				<span class="text-primary">07</span> Audit-Log-{year}.csv — Aktionen im Jahr
			</li>
			<li class="flex items-center gap-2">
				<span class="text-primary">08</span> Mitgliedsbeiträge-{year}.csv — Bezahlte Beiträge
			</li>
		</ul>
	</div>
</div>
