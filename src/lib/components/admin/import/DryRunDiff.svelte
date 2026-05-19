<!--
  DryRunDiff — preview table for a dry-run planImport result.

  Shows per-kind counts, error list, festschreibung violations, and a
  paginated sample of the rows that would be inserted.
-->
<script lang="ts">
	interface PreviewRow {
		businessId: string;
		bezeichnung?: string | null;
		spenderName?: string | null;
		betragCents: string; // serialised BigInt as string
		gebuchtAm: string; // ISO timestamp string
		sphereSnapshot: string;
		kategorieNameSnapshot?: string;
		sourceRef: string;
	}

	interface DryRunError {
		tab: string;
		rowIndex: number;
		message: string;
		preview: string;
	}

	interface Plan {
		idempotencyKey: string;
		sourceHash: string;
		sourceChannel: string;
		counts: {
			expenses: number;
			income: number;
			donations: number;
			auslagenSubmissions: number;
			errors: number;
			skippedDuplicates: number;
		};
		errors: DryRunError[];
		festgeschriebenViolations: number[];
		safeToApply: boolean;
		previewExpenses: PreviewRow[];
		previewIncome: PreviewRow[];
		previewDonations: PreviewRow[];
		duplicatesExisting: { expenses: string[]; income: string[]; donations: string[] };
		yearsTouched: number[];
		previousRun: {
			id: string;
			status: string;
			startedAt: string;
			completedAt: string | null;
			sourceHash: string;
		} | null;
	}

	interface Props {
		plan: Plan;
	}

	let { plan }: Props = $props();

	function formatCents(centsStr: string): string {
		const n = Number(centsStr);
		return (n / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('de-DE');
	}
</script>

<div class="space-y-6">
	<!-- Summary counts -->
	<div class="rounded-lg border bg-card p-4">
		<h3 class="mb-3 text-sm font-semibold text-foreground">Vorschau-Zusammenfassung</h3>
		<dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
			<div>
				<dt class="text-muted-foreground">Ausgaben (neu)</dt>
				<dd class="font-medium">{plan.counts.expenses}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Einnahmen (neu)</dt>
				<dd class="font-medium">{plan.counts.income}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Spenden (neu)</dt>
				<dd class="font-medium">{plan.counts.donations}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Bereits importiert</dt>
				<dd class="font-medium">{plan.counts.skippedDuplicates}</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Fehler</dt>
				<dd class="font-medium {plan.counts.errors > 0 ? 'text-destructive' : ''}">
					{plan.counts.errors}
				</dd>
			</div>
			<div>
				<dt class="text-muted-foreground">Jahre berührt</dt>
				<dd class="font-medium">{plan.yearsTouched.join(', ') || '—'}</dd>
			</div>
		</dl>

		{#if plan.festgeschriebenViolations.length > 0}
			<div class="mt-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
				<strong>Festschreibung-Verletzung:</strong> Die Jahre
				{plan.festgeschriebenViolations.join(', ')} sind bereits festgeschrieben.
				Import nicht möglich.
			</div>
		{/if}

		{#if plan.previousRun}
			<div class="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
				<strong>Vorheriger Import:</strong> Schlüssel
				<code class="font-mono">{plan.idempotencyKey}</code> wurde bereits am
				{formatDate(plan.previousRun.startedAt)} importiert (Status: {plan.previousRun.status}).
				Für erneuten Import "Erzwingen" aktivieren.
			</div>
		{/if}
	</div>

	<!-- Errors -->
	{#if plan.errors.length > 0}
		<div class="rounded-lg border border-destructive/40 bg-card p-4">
			<h3 class="mb-3 text-sm font-semibold text-destructive">
				Validierungsfehler ({plan.errors.length})
			</h3>
			<ul class="space-y-2 text-sm">
				{#each plan.errors as err (`${err.tab}-${err.rowIndex}`)}
					<li class="rounded border border-destructive/20 bg-destructive/5 p-2">
						<span class="font-medium">{err.tab} Zeile {err.rowIndex}:</span>
						{err.message}
						{#if err.preview}
							<br />
							<code class="text-xs text-muted-foreground">{err.preview}</code>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Ausgaben preview -->
	{#if plan.previewExpenses.length > 0}
		<div class="rounded-lg border bg-card">
			<div class="border-b px-4 py-3">
				<h3 class="text-sm font-semibold">
					Ausgaben — {plan.counts.expenses} neue Zeilen
					{#if plan.previewExpenses.length < plan.counts.expenses}
						<span class="font-normal text-muted-foreground">(zeige erste {plan.previewExpenses.length})</span>
					{/if}
				</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/40 text-left text-xs text-muted-foreground">
							<th class="px-3 py-2">ID</th>
							<th class="px-3 py-2">Bezeichnung</th>
							<th class="px-3 py-2">Betrag</th>
							<th class="px-3 py-2">Datum</th>
							<th class="px-3 py-2">Sphäre</th>
							<th class="px-3 py-2">Kategorie</th>
						</tr>
					</thead>
					<tbody>
						{#each plan.previewExpenses as row (row.businessId)}
							<tr class="border-b last:border-0 hover:bg-muted/20">
								<td class="px-3 py-2 font-mono text-xs">{row.businessId}</td>
								<td class="px-3 py-2 max-w-48 truncate">{row.bezeichnung ?? '—'}</td>
								<td class="px-3 py-2 tabular-nums">{formatCents(row.betragCents)}</td>
								<td class="px-3 py-2 tabular-nums">{formatDate(row.gebuchtAm)}</td>
								<td class="px-3 py-2">{row.sphereSnapshot}</td>
								<td class="px-3 py-2 text-muted-foreground">{row.kategorieNameSnapshot ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Einnahmen preview -->
	{#if plan.previewIncome.length > 0}
		<div class="rounded-lg border bg-card">
			<div class="border-b px-4 py-3">
				<h3 class="text-sm font-semibold">
					Einnahmen — {plan.counts.income} neue Zeilen
					{#if plan.previewIncome.length < plan.counts.income}
						<span class="font-normal text-muted-foreground">(zeige erste {plan.previewIncome.length})</span>
					{/if}
				</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/40 text-left text-xs text-muted-foreground">
							<th class="px-3 py-2">ID</th>
							<th class="px-3 py-2">Bezeichnung</th>
							<th class="px-3 py-2">Betrag</th>
							<th class="px-3 py-2">Datum</th>
							<th class="px-3 py-2">Sphäre</th>
							<th class="px-3 py-2">Kategorie</th>
						</tr>
					</thead>
					<tbody>
						{#each plan.previewIncome as row (row.businessId)}
							<tr class="border-b last:border-0 hover:bg-muted/20">
								<td class="px-3 py-2 font-mono text-xs">{row.businessId}</td>
								<td class="px-3 py-2 max-w-48 truncate">{row.bezeichnung ?? '—'}</td>
								<td class="px-3 py-2 tabular-nums">{formatCents(row.betragCents)}</td>
								<td class="px-3 py-2 tabular-nums">{formatDate(row.gebuchtAm)}</td>
								<td class="px-3 py-2">{row.sphereSnapshot}</td>
								<td class="px-3 py-2 text-muted-foreground">{row.kategorieNameSnapshot ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Spenden preview -->
	{#if plan.previewDonations.length > 0}
		<div class="rounded-lg border bg-card">
			<div class="border-b px-4 py-3">
				<h3 class="text-sm font-semibold">
					Spenden — {plan.counts.donations} neue Zeilen
					{#if plan.previewDonations.length < plan.counts.donations}
						<span class="font-normal text-muted-foreground">(zeige erste {plan.previewDonations.length})</span>
					{/if}
				</h3>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/40 text-left text-xs text-muted-foreground">
							<th class="px-3 py-2">ID</th>
							<th class="px-3 py-2">Spender</th>
							<th class="px-3 py-2">Betrag</th>
							<th class="px-3 py-2">Datum</th>
							<th class="px-3 py-2">Sphäre</th>
						</tr>
					</thead>
					<tbody>
						{#each plan.previewDonations as row (row.businessId)}
							<tr class="border-b last:border-0 hover:bg-muted/20">
								<td class="px-3 py-2 font-mono text-xs">{row.businessId}</td>
								<td class="px-3 py-2">{row.spenderName ?? '(anonym)'}</td>
								<td class="px-3 py-2 tabular-nums">{formatCents(row.betragCents)}</td>
								<td class="px-3 py-2 tabular-nums">{formatDate(row.gebuchtAm)}</td>
								<td class="px-3 py-2">{row.sphereSnapshot}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>
