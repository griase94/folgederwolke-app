<script lang="ts">
	import type { TransactionRow } from '$lib/server/domain/transactions.js';

	interface Props {
		row: TransactionRow;
		selected: boolean;
		ontoggle: (id: string) => void;
	}

	let { row, selected, ontoggle }: Props = $props();

	function fmtEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		});
	}

	const kindLabel: Record<string, string> = {
		expense: 'Ausgabe',
		income: 'Einnahme',
		donation: 'Spende',
	};

	const kindColor: Record<string, string> = {
		expense: 'bg-red-50 text-red-700 ring-red-200',
		income: 'bg-green-50 text-green-700 ring-green-200',
		donation: 'bg-blue-50 text-blue-700 ring-blue-200',
	};

	const statusLabel: Record<string, string> = {
		zu_pruefen: 'Zu prüfen',
		in_pruefung: 'In Prüfung',
		geprueft: 'Genehmigt',
		abgelehnt: 'Abgelehnt',
		erstattet: 'Erstattet',
		importiert: 'Importiert',
	};

	const isFestgeschrieben = $derived(row.festgeschriebenAt !== null);
	const detailHref = $derived(`/app/transactions/${row.id}?kind=${row.kind}`);
</script>

<tr
	class={[
		'group border-b border-border transition-colors hover:bg-muted/40',
		selected ? 'bg-primary/5' : '',
		isFestgeschrieben ? 'opacity-75' : '',
	].join(' ')}
>
	<!-- Checkbox -->
	<td class="w-10 px-3 py-3">
		<input
			type="checkbox"
			checked={selected}
			onchange={() => ontoggle(row.id)}
			aria-label="Auswählen"
			class="h-4 w-4 rounded border-border accent-primary"
			disabled={isFestgeschrieben}
		/>
	</td>

	<!-- Kind badge -->
	<td class="px-3 py-3">
		<span
			class={[
				'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
				kindColor[row.kind] ?? 'bg-muted text-muted-foreground ring-border',
			].join(' ')}
		>
			{kindLabel[row.kind] ?? row.kind}
		</span>
	</td>

	<!-- Bezeichnung -->
	<td class="max-w-xs px-3 py-3">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a href={detailHref} class="font-medium text-foreground hover:text-primary hover:underline">
			<span class="block truncate">{row.bezeichnung}</span>
		</a>
		{#if row.bezahltVonDisplay}
			<span class="block truncate text-xs text-muted-foreground">{row.bezahltVonDisplay}</span>
		{/if}
	</td>

	<!-- Betrag -->
	<td class="px-3 py-3 text-right font-mono text-sm tabular-nums">
		<span class={row.kind === 'expense' ? 'text-red-700' : 'text-green-700'}>
			{row.kind === 'expense' ? '−' : '+'}{fmtEur(row.betragCents)}
		</span>
	</td>

	<!-- Datum -->
	<td class="px-3 py-3 text-sm text-muted-foreground">
		{fmtDate(row.rechnungsdatum ?? row.gebuchtAm)}
	</td>

	<!-- Status (expense only) -->
	<td class="px-3 py-3">
		{#if row.status}
			<span
				class={[
					'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
					row.status === 'erstattet'
						? 'bg-green-50 text-green-700'
						: row.status === 'geprueft'
							? 'bg-amber-50 text-amber-700'
							: row.status === 'abgelehnt'
								? 'bg-red-50 text-red-700'
								: 'bg-muted text-muted-foreground',
				].join(' ')}
			>
				{statusLabel[row.status] ?? row.status}
			</span>
		{:else}
			<span class="text-xs text-muted-foreground">—</span>
		{/if}
	</td>

	<!-- Kategorie / Sphäre -->
	<td class="hidden px-3 py-3 text-xs text-muted-foreground xl:table-cell">
		<span class="block truncate max-w-[140px]">{row.kategorieNameSnapshot}</span>
		<span class="text-[10px] opacity-70">{row.sphereEffective}</span>
	</td>

	<!-- Festgeschrieben indicator -->
	<td class="px-3 py-3">
		{#if isFestgeschrieben}
			<span class="text-xs text-muted-foreground" title="Festgeschrieben">🔒</span>
		{/if}
	</td>

	<!-- Actions -->
	<td class="px-3 py-3">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={detailHref}
			class="rounded px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
			aria-label="Details anzeigen"
		>
			Details →
		</a>
	</td>
</tr>
