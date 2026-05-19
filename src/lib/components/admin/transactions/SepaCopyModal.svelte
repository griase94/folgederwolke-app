<script lang="ts">
	/**
	 * SepaCopyModal — generates SEPA pain.001.001.03 XML for selected approved
	 * expenses and copies to clipboard, then offers to open post-SEPA modal.
	 */
	import type { ApprovedExpense } from '$lib/server/domain/transactions.js';

	interface Props {
		open: boolean;
		expenses: ApprovedExpense[];
		onclose: () => void;
		oncopied: (expenseIds: string[], totalCents: number) => void;
	}

	let { open, expenses, onclose, oncopied }: Props = $props();

	let status = $state<'idle' | 'copying' | 'copied' | 'error'>('idle');
	let errorMsg = $state('');

	const eligibleExpenses = $derived(
		expenses.filter((e) => {
			const iban = e.bezahltVonKind === 'extern' ? e.externIban : e.memberIban;
			return iban && iban.length > 0;
		}),
	);

	const skippedCount = $derived(expenses.length - eligibleExpenses.length);

	const totalCents = $derived(eligibleExpenses.reduce((s, e) => s + e.betragCents, 0));

	function fmtEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	async function copyXml() {
		if (eligibleExpenses.length === 0) return;
		status = 'copying';
		errorMsg = '';

		try {
			const res = await fetch('/api/sepa/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ expenseIds: eligibleExpenses.map((e) => e.id) }),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}

			const { xml } = await res.json();
			await navigator.clipboard.writeText(xml);
			status = 'copied';

			setTimeout(() => {
				oncopied(
					eligibleExpenses.map((e) => e.id),
					totalCents,
				);
			}, 800);
		} catch (err) {
			status = 'error';
			errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="sepa-modal-title"
	>
		<div class="w-full max-w-md rounded-xl bg-background shadow-xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border px-6 py-4">
				<h2 id="sepa-modal-title" class="text-base font-semibold text-foreground">
					SEPA XML kopieren
				</h2>
				<button
					onclick={onclose}
					class="rounded p-1 text-muted-foreground hover:text-foreground"
					aria-label="Schließen"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Body -->
			<div class="px-6 py-5 space-y-4">
				{#if eligibleExpenses.length === 0}
					<p class="text-sm text-muted-foreground">
						Keine Auslagen mit bekannter IBAN gefunden. Bitte trage zuerst die IBAN der Empfänger ein.
					</p>
				{:else}
					<div class="rounded-lg bg-muted/50 px-4 py-3 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Auslagen</span>
							<span class="font-medium">{eligibleExpenses.length}</span>
						</div>
						<div class="flex justify-between mt-1">
							<span class="text-muted-foreground">Gesamtbetrag</span>
							<span class="font-semibold text-foreground">{fmtEur(totalCents)}</span>
						</div>
						{#if skippedCount > 0}
							<p class="mt-2 text-xs text-amber-600">
								{skippedCount} {skippedCount === 1 ? 'Auslage übersprungen' : 'Auslagen übersprungen'} (keine IBAN hinterlegt)
							</p>
						{/if}
					</div>

					<p class="text-sm text-muted-foreground">
						Das pain.001.001.03 XML wird in deine Zwischenablage kopiert. Füge es dann in dein Banking-Tool ein.
					</p>

					{#if status === 'error'}
						<p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex justify-end gap-3 border-t border-border px-6 py-4">
				<button
					onclick={onclose}
					class="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
				>
					Abbrechen
				</button>
				{#if eligibleExpenses.length > 0}
					<button
						onclick={copyXml}
						disabled={status === 'copying' || status === 'copied'}
						class={[
							'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
							status === 'copied'
								? 'bg-green-600 text-white'
								: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60',
						].join(' ')}
					>
						{#if status === 'copying'}
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							Generiere…
						{:else if status === 'copied'}
							✓ Kopiert!
						{:else}
							XML kopieren ({eligibleExpenses.length})
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}
