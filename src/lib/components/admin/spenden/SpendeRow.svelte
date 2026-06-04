<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	type Spende = {
		id: string;
		businessId: string;
		gebuchtAm: string;
		zugewendetAm: string | null;
		betragCents: number;
		currency: string;
		spendeKind: 'geldspende' | 'sachspende' | 'aufwandsspende';
		spenderName: string | null;
		spenderAdresse: string | null;
		spenderEmail: string | null;
		memberId: string | null;
		bescheinigungNr: string | null;
		bescheinigungAusgestelltAm: string | null;
		bescheidTyp: 'geldspende' | 'sachspende' | 'aufwandsspende' | 'sammelbestaetigung' | null;
		// P1-T10/T12: donations.kategorie_id is now NOT NULL (see SpendenList).
		kategorieId: string;
		kategorieNameSnapshot: string;
		sphereSnapshot: 'ideeller' | 'vermoegen' | 'zweckbetrieb' | 'wirtschaftlich';
		festgeschriebenAt: string | null;
		zweckbindungKind: 'zweckfrei' | 'zweckgebunden';
		zweckbindungText: string | null;
		projectId: string | null;
		yearOfBuchung: number | null;
	};

	let {
		spende,
		bescheinigungEnabled,
		onEdit
	}: {
		spende: Spende;
		bescheinigungEnabled: boolean;
		onEdit: (s: Spende) => void;
	} = $props();

	const fmt = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: spende.currency ?? 'EUR',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});

	const dateDe = (iso: string | null) => {
		if (!iso) return '–';
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
	};

	const kindLabel = (k: string) => {
		if (k === 'sachspende') return 'Sachspende';
		if (k === 'aufwandsspende') return 'Aufwandsspende';
		return 'Geldspende';
	};
</script>

<article
	class="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
	data-testid="spende-row"
	data-spende-id={spende.id}
>
	<div class="min-w-0 flex-1">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono text-xs text-muted-foreground" data-testid="spende-business-id">
				{spende.businessId}
			</span>
			<Badge variant="secondary">{kindLabel(spende.spendeKind)}</Badge>
			{#if spende.bescheinigungNr}
				<Badge data-testid="bescheinigung-badge">{spende.bescheinigungNr}</Badge>
			{/if}
			{#if spende.festgeschriebenAt}
				<Badge variant="outline">festgeschrieben</Badge>
			{/if}
			{#if spende.zweckbindungKind === 'zweckgebunden'}
				<Badge variant="outline">zweckgebunden</Badge>
			{/if}
		</div>
		<div class="mt-1 truncate text-sm font-medium text-foreground">
			{spende.spenderName ?? '(unbekannter Spender)'}
		</div>
		<div class="truncate text-xs text-muted-foreground">
			{dateDe(spende.zugewendetAm)} &middot; {spende.kategorieNameSnapshot}
		</div>
	</div>
	<div class="flex shrink-0 items-center gap-2 sm:gap-3">
		<div class="text-right text-sm font-semibold tabular-nums" data-testid="spende-betrag">
			{fmt(spende.betragCents)}
		</div>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onclick={() => onEdit(spende)}
				disabled={!!spende.bescheinigungNr || !!spende.festgeschriebenAt}
				data-testid="edit-spende-btn"
			>
				Bearbeiten
			</Button>
			<Button
				size="sm"
				href={`/app/transactions/${spende.id}/zuwendungsbestaetigung`}
				disabled={!bescheinigungEnabled && !spende.bescheinigungNr}
				data-testid="bescheinigung-btn"
			>
				{spende.bescheinigungNr ? 'PDF' : 'Bescheinigung'}
			</Button>
		</div>
	</div>
</article>
