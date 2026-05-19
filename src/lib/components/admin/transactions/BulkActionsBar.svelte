<script lang="ts">
	import type { ZahlungsartOption } from '$lib/server/domain/transactions.js';

	interface Props {
		selectedIds: string[];
		zahlungsarten: ZahlungsartOption[];
		onMarkErstattet: (ids: string[], chosenDate: string, zahlungsartId: string) => void;
		onSepaXml: (ids: string[]) => void;
		onClear: () => void;
	}

	let { selectedIds, zahlungsarten, onMarkErstattet, onSepaXml, onClear }: Props = $props();

	let chosenDate = $state(new Date().toISOString().slice(0, 10));
	let zahlungsartId = $state('');
	let showDatePicker = $state(false);

	$effect(() => {
		if (!zahlungsartId && zahlungsarten.length > 0) {
			zahlungsartId = zahlungsarten[0]?.id ?? '';
		}
	});

	const count = $derived(selectedIds.length);
</script>

{#if count > 0}
	<div
		class="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3"
		role="region"
		aria-label="Massenaktionen"
	>
		<span class="text-sm font-medium text-foreground">
			{count} {count === 1 ? 'Transaktion' : 'Transaktionen'} ausgewählt
		</span>

		<div class="flex flex-wrap items-center gap-2">
			<!-- SEPA XML -->
			<button
				onclick={() => onSepaXml(selectedIds)}
				class="inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
				SEPA XML kopieren ({count})
			</button>

			<!-- Mark Erstattet -->
			{#if !showDatePicker}
				<button
					onclick={() => (showDatePicker = true)}
					class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
				>
					Als erstattet markieren
				</button>
			{:else}
				<div class="flex flex-wrap items-center gap-2">
					<input
						type="date"
						bind:value={chosenDate}
						class="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
					<select
						bind:value={zahlungsartId}
						class="rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					>
						{#each zahlungsarten as z (z.id)}
							<option value={z.id}>{z.label}</option>
						{/each}
					</select>
					<button
						onclick={() => {
							onMarkErstattet(selectedIds, chosenDate, zahlungsartId);
							showDatePicker = false;
						}}
						class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						Bestätigen
					</button>
					<button
						onclick={() => (showDatePicker = false)}
						class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
					>
						Abbrechen
					</button>
				</div>
			{/if}
		</div>

		<button
			onclick={onClear}
			class="ml-auto text-xs text-muted-foreground hover:text-foreground"
			aria-label="Auswahl aufheben"
		>
			✕ Aufheben
		</button>
	</div>
{/if}
