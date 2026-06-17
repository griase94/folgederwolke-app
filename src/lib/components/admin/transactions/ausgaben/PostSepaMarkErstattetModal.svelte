<script lang="ts">
	/**
	 * PostSepaMarkErstattetModal — §5.5.1 spec:
	 * After SEPA XML copied, prompt user to mark all as erstattet + fire mails.
	 */
	import type { ZahlungsartOption } from '$lib/server/domain/transactions.js';

	interface Props {
		open: boolean;
		expenseIds: string[];
		totalCents: number;
		zahlungsarten: ZahlungsartOption[];
		onclose: () => void;
		onsuccess: (count: number) => void;
	}

	let { open, expenseIds, totalCents, zahlungsarten, onclose, onsuccess }: Props = $props();

	let chosenDate = $state(new Date().toISOString().slice(0, 10));
	let zahlungsartId = $state('');
	let status = $state<'idle' | 'submitting' | 'done' | 'error'>('idle');

	// Default to Banküberweisung (kind='bank') if available
	$effect(() => {
		if (!zahlungsartId && zahlungsarten.length > 0) {
			zahlungsartId =
				zahlungsarten.find((z) => z.kind === 'bank')?.id ?? zahlungsarten[0]?.id ?? '';
		}
	});
	let errorMsg = $state('');

	function fmtEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	async function submit() {
		if (!zahlungsartId || !chosenDate) return;
		status = 'submitting';
		errorMsg = '';

		try {
			const formData = new FormData();
			formData.set('expenseIds', expenseIds.join(','));
			formData.set('chosenDate', chosenDate);
			formData.set('zahlungsartId', zahlungsartId);
			formData.set('notify', 'true');

			const res = await fetch('?/sepa-mark-erstattet', {
				method: 'POST',
				body: formData,
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body?.data?.error ?? `HTTP ${res.status}`);
			}

			status = 'done';
			onsuccess(expenseIds.length);
		} catch (err) {
			status = 'error';
			errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && status !== 'submitting') onclose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		role="dialog"
		aria-modal="true"
		aria-labelledby="post-sepa-modal-title"
	>
		<div class="w-full max-w-md rounded-xl bg-background shadow-xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-border px-6 py-4">
				<h2 id="post-sepa-modal-title" class="text-base font-semibold text-foreground">
					Auslagen als erstattet markieren
				</h2>
				{#if status !== 'submitting'}
					<button
						onclick={onclose}
						class="rounded p-1 text-muted-foreground hover:text-foreground"
						aria-label="Schließen"
					>
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>

			{#if status === 'done'}
				<!-- Success state -->
				<div class="px-6 py-8 text-center space-y-3">
					<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
						<svg class="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<p class="font-medium text-foreground">
						{expenseIds.length} {expenseIds.length === 1 ? 'Auslage' : 'Auslagen'} als erstattet markiert
					</p>
					<p class="text-sm text-muted-foreground">Erstattungsmails wurden versandt.</p>
					<button
						onclick={onclose}
						class="mt-4 rounded-md bg-primary-strong px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-strong/90"
					>
						Schließen
					</button>
				</div>
			{:else}
				<!-- Form state -->
				<div class="px-6 py-5 space-y-4">
					<p class="text-sm text-muted-foreground">
						Du hast SEPA-XML für <strong>{expenseIds.length} {expenseIds.length === 1 ? 'Auslage' : 'Auslagen'}</strong>
						({fmtEur(totalCents)}) kopiert.
					</p>
					<p class="text-sm text-muted-foreground">
						Sobald du sie in deinem Banking-Tool abgesendet hast, kannst du sie hier als erstattet markieren.
					</p>

					<div class="space-y-3">
						<div>
							<label for="post-sepa-date" class="mb-1 block text-sm font-medium text-foreground">
								Erstattungsdatum
							</label>
							<input
								id="post-sepa-date"
								type="date"
								lang="de"
								bind:value={chosenDate}
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							/>
						</div>

						<div>
							<label for="post-sepa-zahlungsart" class="mb-1 block text-sm font-medium text-foreground">
								Zahlungsart
							</label>
							<select
								id="post-sepa-zahlungsart"
								bind:value={zahlungsartId}
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							>
								{#each zahlungsarten as z (z.id)}
									<option value={z.id}>{z.label}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if status === 'error'}
						<p class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMsg}</p>
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex justify-end gap-3 border-t border-border px-6 py-4">
					<button
						onclick={onclose}
						disabled={status === 'submitting'}
						class="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
					>
						Später
					</button>
					<button
						onclick={submit}
						disabled={status === 'submitting' || !zahlungsartId}
						class="inline-flex items-center gap-2 rounded-md bg-primary-strong px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-strong/90 disabled:opacity-60"
					>
						{#if status === 'submitting'}
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							Markiere…
						{:else}
							Alle {expenseIds.length} als erstattet markieren + Mails verschicken
						{/if}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
