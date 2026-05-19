<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	type Spende = {
		id: string;
		businessId: string;
		zugewendetAm: string | null;
		betragCents: number;
		currency: string;
		spendeKind: string;
		spenderName: string | null;
		spenderAdresse: string | null;
		spenderEmail: string | null;
		kategorieNameSnapshot: string;
		sphereSnapshot: string;
		zweckbindungKind: string;
		zweckbindungText: string | null;
		bescheinigungNr: string | null;
		bescheinigungAusgestelltAm: string | null;
		festgeschriebenAt: string | null;
	};

	let { spende }: { spende: Spende } = $props();

	const fmt = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: spende.currency ?? 'EUR'
		});

	const dateDe = (iso: string | null) => {
		if (!iso) return '–';
		const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
	};
</script>

<section class="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
	<header class="flex flex-wrap items-center gap-2">
		<span class="font-mono text-xs text-muted-foreground">{spende.businessId}</span>
		<Badge variant="secondary">
			{spende.spendeKind === 'sachspende' ? 'Sachspende' : 'Geldspende'}
		</Badge>
		{#if spende.bescheinigungNr}
			<Badge>{spende.bescheinigungNr}</Badge>
		{/if}
		{#if spende.festgeschriebenAt}
			<Badge variant="outline">festgeschrieben</Badge>
		{/if}
	</header>

	<dl class="grid grid-cols-1 gap-3 sm:grid-cols-2">
		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Spender</dt>
			<dd class="font-medium">{spende.spenderName ?? '–'}</dd>
			<dd class="whitespace-pre-line text-xs text-muted-foreground">
				{spende.spenderAdresse ?? ''}
			</dd>
		</div>
		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Zuwendungsdatum</dt>
			<dd>{dateDe(spende.zugewendetAm)}</dd>
		</div>
		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Betrag</dt>
			<dd class="text-base font-semibold tabular-nums">{fmt(spende.betragCents)}</dd>
		</div>
		<div>
			<dt class="text-xs uppercase tracking-wide text-muted-foreground">Kategorie</dt>
			<dd>{spende.kategorieNameSnapshot} ({spende.sphereSnapshot})</dd>
		</div>
		{#if spende.zweckbindungKind === 'zweckgebunden'}
			<div class="sm:col-span-2">
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Zweckbindung</dt>
				<dd>{spende.zweckbindungText ?? '–'}</dd>
			</div>
		{/if}
		{#if spende.bescheinigungNr}
			<div class="sm:col-span-2">
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Bescheinigung</dt>
				<dd>
					{spende.bescheinigungNr} &middot; ausgestellt am
					{dateDe(spende.bescheinigungAusgestelltAm)}
				</dd>
			</div>
		{/if}
	</dl>
</section>
