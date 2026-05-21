<script lang="ts">
	import type { TransactionDetail, ZahlungsartOption } from '$lib/server/domain/transactions.js';

	interface Props {
		detail: TransactionDetail;
		zahlungsarten: ZahlungsartOption[];
		isFestgeschrieben: boolean;
	}

	let { detail, zahlungsarten: _za, isFestgeschrieben }: Props = $props();

	function fmtEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
		return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	function fmtTs(iso: string): string {
		return new Date(iso).toLocaleString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	const actionLabel: Record<string, string> = {
		create: 'Erstellt',
		update: 'Bearbeitet',
		approve: 'Genehmigt',
		reject: 'Abgelehnt',
		reimburse: 'Erstattet',
		import: 'Importiert',
		festschreibung: 'Festgeschrieben',
		storno: 'Storniert',
	};

	const kindLabel: Record<string, string> = {
		expense: 'Ausgabe',
		income: 'Einnahme',
		donation: 'Spende',
	};
</script>

<div class="space-y-6">
	<!-- ── Header ────────────────────────────────────────────────────────── -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<div class="flex items-center gap-2 text-xs text-muted-foreground mb-1">
				<span>{kindLabel[detail.kind] ?? detail.kind}</span>
				<span>·</span>
				<span class="font-mono">{detail.businessId}</span>
				{#if isFestgeschrieben}
					<span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
						🔒 Festgeschrieben
					</span>
				{/if}
			</div>
			<h1 class="text-xl font-bold text-foreground">{detail.bezeichnung}</h1>
			<p class="mt-1 text-2xl font-semibold tabular-nums {detail.kind === 'expense' ? 'text-red-700' : 'text-green-700'}">
				{detail.kind === 'expense' ? '−' : '+'}{fmtEur(detail.betragCents)}
			</p>
		</div>

		{#if !isFestgeschrieben}
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href="{detail.id}/edit?kind={detail.kind}"
				class="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
			>
				Bearbeiten
			</a>
		{/if}
	</div>

	<!-- ── Details grid ────────────────────────────────────────────────── -->
	<dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
		<div>
			<dt class="text-muted-foreground">Gebucht am</dt>
			<dd class="font-medium">{fmtDate(detail.gebuchtAm)}</dd>
		</div>
		{#if detail.rechnungsdatum}
			<div>
				<dt class="text-muted-foreground">Rechnungsdatum</dt>
				<dd class="font-medium">{fmtDate(detail.rechnungsdatum)}</dd>
			</div>
		{/if}
		<div>
			<dt class="text-muted-foreground">Buchungsjahr</dt>
			<dd class="font-medium">{detail.yearOfBuchung ?? '—'}</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Sphäre</dt>
			<dd class="font-medium">{detail.sphereEffective}</dd>
		</div>
		<div>
			<dt class="text-muted-foreground">Kategorie</dt>
			<dd class="font-medium">{detail.kategorieNameSnapshot}</dd>
		</div>
		{#if detail.kind === 'expense'}
			<div>
				<dt class="text-muted-foreground">Status</dt>
				<dd class="font-medium">{detail.status ?? '—'}</dd>
			</div>
			{#if detail.erstattetAm}
				<div>
					<dt class="text-muted-foreground">Erstattet am</dt>
					<dd class="font-medium">{fmtDate(detail.erstattetAm)}</dd>
				</div>
			{/if}
			{#if detail.bezahltVonDisplay}
				<div>
					<dt class="text-muted-foreground">Bezahlt von</dt>
					<dd class="font-medium">{detail.bezahltVonDisplay}</dd>
				</div>
			{/if}
			{#if detail.externIban}
				<div>
					<dt class="text-muted-foreground">IBAN</dt>
					<dd class="font-mono text-xs">{detail.externIban}</dd>
				</div>
			{/if}
		{/if}
		{#if detail.kind === 'donation'}
			{#if detail.spenderName}
				<div>
					<dt class="text-muted-foreground">Spender</dt>
					<dd class="font-medium">{detail.spenderName}</dd>
				</div>
			{/if}
			{#if detail.bescheinigungNr}
				<div>
					<dt class="text-muted-foreground">Bescheinigung</dt>
					<dd class="font-mono">{detail.bescheinigungNr}</dd>
				</div>
			{/if}
		{/if}
		{#if detail.kommentar}
			<div class="col-span-2 sm:col-span-3">
				<dt class="text-muted-foreground">Kommentar</dt>
				<dd class="text-foreground">{detail.kommentar}</dd>
			</div>
		{/if}
	</dl>

	<!-- ── Activity timeline ───────────────────────────────────────────── -->
	<section aria-labelledby="timeline-heading">
		<h2 id="timeline-heading" class="mb-3 text-sm font-semibold text-foreground">Aktivitäten</h2>

		{#if detail.timeline.length === 0}
			<p class="text-sm text-muted-foreground">Noch keine Aktivitäten erfasst.</p>
		{:else}
			<ol class="relative border-l border-border pl-6 space-y-4">
				{#each detail.timeline as entry (entry.id)}
					<li class="relative">
						<div
							class="absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full bg-background ring-2 ring-border"
						>
							<div class="h-2 w-2 rounded-full bg-primary/60"></div>
						</div>
						<div class="flex items-baseline gap-2">
							<span class="text-xs font-medium text-foreground">
								{actionLabel[entry.action] ?? entry.action}
							</span>
							<span class="text-xs text-muted-foreground">{fmtTs(entry.occurredAt)}</span>
							{#if entry.actorKind === 'user'}
								<span class="text-xs text-muted-foreground">· Admin</span>
							{:else}
								<span class="text-xs text-muted-foreground">· System</span>
							{/if}
						</div>
						{#if entry.payload && typeof entry.payload === 'object'}
							{@const p = entry.payload as Record<string, unknown>}
							{#if p.bezeichnung || p.betragCents || p.grund}
								<p class="mt-0.5 text-xs text-muted-foreground">
									{#if p.bezeichnung}{p.bezeichnung as string}{/if}
									{#if p.betragCents}
										· {((p.betragCents as number) / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
									{/if}
									{#if p.grund} · Grund: {p.grund as string}{/if}
								</p>
							{/if}
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</div>
