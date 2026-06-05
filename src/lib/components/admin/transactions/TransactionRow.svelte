<script lang="ts">
	import type { TransactionRow, ZahlungsartOption } from '$lib/server/domain/transactions.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';

	interface Props {
		row: TransactionRow;
		selected: boolean;
		ontoggle: (id: string) => void;
		zahlungsarten?: ZahlungsartOption[];
		detailHref?: string;
	}

	let { row, selected, ontoggle, zahlungsarten = [], detailHref }: Props = $props();
	const resolvedDetailHref = $derived(detailHref ?? `/app/transactions/${row.id}?kind=${row.kind}`);

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

	// C3-DISC: kebab is shown only for expenses that are approved but not yet
	// erstattet and not festgeschrieben. Matches the same gate as the
	// TransactionEditForm's Erstattung block so both surfaces stay in sync.
	const canQuickMarkPaid = $derived(
		row.kind === 'expense'
			&& row.status === 'geprueft'
			&& !row.erstattetAm
			&& !isFestgeschrieben,
	);

	let dropdownOpen = $state(false);
	let markPaidOpen = $state(false);
	let datum = $state(new Date().toISOString().slice(0, 10));
	let zahlartId = $state('');
	let submitting = $state(false);

	function openMarkPaid() {
		datum = new Date().toISOString().slice(0, 10);
		zahlartId = zahlungsarten.find((z) => z.kind === 'bank')?.id ?? zahlungsarten[0]?.id ?? '';
		markPaidOpen = true;
		dropdownOpen = false;
	}

	function cancelMarkPaid() {
		markPaidOpen = false;
	}
</script>

<tr
	class={[
		'group border-b border-border transition-colors hover:bg-muted/40',
		selected ? 'bg-primary/5' : '',
		isFestgeschrieben ? 'opacity-75' : '',
	].join(' ')}
	data-testid="txn-row"
	data-row-id={row.id}
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
		<a href={resolvedDetailHref} class="font-medium text-foreground hover:text-primary hover:underline">
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
	<td class="px-3 py-3" data-testid="txn-row-status">
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

	<!-- Actions: kebab (C3-DISC) + details -->
	<td class="px-3 py-3 text-right">
		<div class="flex items-center justify-end gap-1">
			{#if canQuickMarkPaid}
				<DropdownMenu.Root bind:open={dropdownOpen}>
					<DropdownMenu.Trigger
						class="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label="Aktionen für Auslage"
						data-testid="txn-row-kebab"
					>
						<svg
							class="h-4 w-4"
							fill="currentColor"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<circle cx="12" cy="5" r="1.5" />
							<circle cx="12" cy="12" r="1.5" />
							<circle cx="12" cy="19" r="1.5" />
						</svg>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-52">
						<DropdownMenu.Item
							onSelect={openMarkPaid}
							data-testid="txn-row-mark-paid"
						>
							Bezahlt markieren
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}

			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={resolvedDetailHref}
				class="rounded px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
				aria-label="Details anzeigen"
			>
				Details →
			</a>
		</div>
	</td>
</tr>

{#if markPaidOpen}
	<!-- Inline dialog row — Svelte's <dialog> would break the <tr> grouping,
		 so render a row-spanning <tr> directly underneath the source row. -->
	<tr data-testid="mark-paid-dialog" data-row-id={row.id}>
		<td colspan="9" class="border-b border-border bg-muted/30 px-4 py-3">
			<form
				method="POST"
				action="?/markAsPaid"
				use:enhance={() => {
					submitting = true;
					return async ({ result }) => {
						submitting = false;
						if (result.type === 'success') {
							toast.success('Als bezahlt markiert');
							markPaidOpen = false;
							await invalidateAll();
						} else if (result.type === 'failure') {
							toast.error(
								(result.data?.['error'] as string | undefined)
									?? 'Bezahlt-Markierung fehlgeschlagen',
							);
						}
					};
				}}
				class="flex flex-wrap items-end gap-3"
			>
				<input type="hidden" name="id" value={row.id} />

				<div class="min-w-[160px]">
					<label
						for="mark-paid-datum-{row.id}"
						class="mb-1 block text-xs font-medium text-foreground"
					>
						Datum
					</label>
					<input
						id="mark-paid-datum-{row.id}"
						name="datum"
						type="date"
						lang="de"
						bind:value={datum}
						required
						class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
						data-testid="mark-paid-datum"
					/>
				</div>

				{#if zahlungsarten.length > 0}
					<div class="min-w-[180px]">
						<label
							for="mark-paid-zahlart-{row.id}"
							class="mb-1 block text-xs font-medium text-foreground"
						>
							Zahlungsart (optional)
						</label>
						<select
							id="mark-paid-zahlart-{row.id}"
							name="zahlart"
							bind:value={zahlartId}
							class="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
						>
							<option value="">— keine —</option>
							{#each zahlungsarten as z (z.id)}
								<option value={z.id}>{z.label}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="flex gap-2 pt-1">
					<button
						type="submit"
						disabled={submitting}
						class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
						data-testid="mark-paid-submit"
					>
						{submitting ? 'Speichere…' : 'Bestätigen'}
					</button>
					<button
						type="button"
						onclick={cancelMarkPaid}
						disabled={submitting}
						class="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-60"
					>
						Abbrechen
					</button>
				</div>
			</form>
		</td>
	</tr>
{/if}
