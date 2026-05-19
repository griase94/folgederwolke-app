<script lang="ts">
	type SummaryData = {
		email: string;
		members: number;
		donations: number;
		auslagenSubmissions: number;
		sentMails: number;
		auditLogEntries: number;
		filename?: string;
		pdfBase64?: string;
	};

	let { summary }: { summary: SummaryData } = $props();

	const sections: Array<{ label: string; key: keyof SummaryData }> = [
		{ label: 'Mitglieder', key: 'members' },
		{ label: 'Spenden', key: 'donations' },
		{ label: 'Auslagen-Einreichungen', key: 'auslagenSubmissions' },
		{ label: 'Gesendete E-Mails', key: 'sentMails' },
		{ label: 'Audit-Log Einträge', key: 'auditLogEntries' }
	];

	function downloadPdf() {
		if (!summary.pdfBase64 || !summary.filename) return;
		const binary = atob(summary.pdfBase64);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		const blob = new Blob([bytes], { type: 'application/pdf' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = summary.filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<section
	class="rounded-xl border border-border bg-card px-5 py-5 shadow-sm"
	data-testid="auskunft-preview"
>
	<header class="border-b border-border pb-3">
		<p class="text-xs uppercase tracking-wide text-muted-foreground">Datenschutz-Auskunft</p>
		<h2 class="mt-1 text-lg font-semibold text-foreground">Gefundene Daten</h2>
		<p class="mt-0.5 text-sm text-muted-foreground" data-testid="auskunft-email">
			E-Mail: <span class="font-medium text-foreground">{summary.email}</span>
		</p>
	</header>

	<ul class="mt-4 space-y-2">
		{#each sections as section (section.key)}
			<li class="flex items-center justify-between rounded-lg px-3 py-2 text-sm odd:bg-muted/30">
				<span class="text-muted-foreground">{section.label}</span>
				<span
					class="tabular-nums font-semibold {(summary[section.key] as number) > 0
						? 'text-foreground'
						: 'text-muted-foreground/60'}"
					data-testid="count-{section.key}"
				>
					{summary[section.key]}
				</span>
			</li>
		{/each}
	</ul>

	{#if summary.pdfBase64}
		<div class="mt-5 border-t border-border pt-4">
			<button
				type="button"
				onclick={downloadPdf}
				class="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				data-testid="download-pdf-btn"
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
				PDF herunterladen ({summary.filename ?? 'Auskunft.pdf'})
			</button>
		</div>
	{/if}
</section>
