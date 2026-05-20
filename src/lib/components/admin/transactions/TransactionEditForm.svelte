<script lang="ts">
	/**
	 * TransactionEditForm — pre-Festschreibung inline edit.
	 * Save (no mail) + Save+Notify (marks erstattet + fires ErstattungsMail).
	 * Post-Festschreibung: read-only (enforced server-side; UI hides form).
	 */
	import type { TransactionDetail, ZahlungsartOption } from '$lib/server/domain/transactions.js';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';

	interface Props {
		detail: TransactionDetail;
		zahlungsarten: ZahlungsartOption[];
		isFestgeschrieben: boolean;
	}

	let { detail, zahlungsarten, isFestgeschrieben }: Props = $props();

	let saving = $state(false);
	let savingAndNotifying = $state(false);

	// Form field state — initialized once from props via $derived.by so that
	// Svelte 5 doesn't warn about "only captures the initial value".
	// Each field starts from the prop value and is mutable via the setter.
	let bezeichnung = $state('');
	let betragEur = $state('0.00');
	let rechnungsdatum = $state('');
	let kommentar = $state('');
	let erstattetAm = $state(new Date().toISOString().slice(0, 10));
	let zahlungsartId = $state('');

	// Sync prop → local state when detail changes (e.g. after invalidateAll)
	$effect(() => {
		bezeichnung = detail.bezeichnung;
		betragEur = (detail.betragCents / 100).toFixed(2);
		rechnungsdatum = detail.rechnungsdatum ?? '';
		kommentar = detail.kommentar ?? '';
		erstattetAm = detail.erstattetAm ?? new Date().toISOString().slice(0, 10);
		zahlungsartId =
			detail.zahlungsartId ??
			zahlungsarten.find((z) => z.kind === 'bank')?.id ??
			zahlungsarten[0]?.id ??
			'';
	});

	const betragCents = $derived(Math.round(parseFloat(betragEur || '0') * 100));
	const kindParam = $derived(`?kind=${detail.kind}`);

	// Recipient name for "Speichern und benachrichtigen" toast
	const recipientVorname = $derived(
		detail.externName
			? (detail.externName.split(' ')[0] ?? detail.externName)
			: detail.bezahltVonDisplay
				? (detail.bezahltVonDisplay.split(' ')[0] ?? detail.bezahltVonDisplay)
				: 'Mitglied',
	);
</script>

{#if isFestgeschrieben}
	<div class="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
		🔒 Dieses Buchungsjahr ist festgeschrieben. Bearbeitungen sind nicht mehr möglich.
	</div>
{:else}
	<form
		method="POST"
		action="?/save{kindParam}"
		use:enhance={() => {
			saving = true;
			return async ({ result, update }) => {
				saving = false;
				if (result.type === 'success') {
					toast.success('Gespeichert');
					await invalidateAll();
				} else if (result.type === 'failure') {
					toast.error((result.data?.error as string) ?? 'Fehler beim Speichern');
				}
				await update({ reset: false });
			};
		}}
		class="space-y-4"
	>
		<input type="hidden" name="betragCents" value={betragCents} />

		<!-- Bezeichnung -->
		<div>
			<label for="bezeichnung" class="mb-1 block text-sm font-medium text-foreground">
				Bezeichnung <span aria-hidden="true" class="text-red-500">*</span>
			</label>
			<input
				id="bezeichnung"
				name="bezeichnung"
				type="text"
				bind:value={bezeichnung}
				required
				maxlength={500}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
			/>
		</div>

		<!-- Betrag -->
		<div>
			<label for="betrag" class="mb-1 block text-sm font-medium text-foreground">
				Betrag (€) <span aria-hidden="true" class="text-red-500">*</span>
			</label>
			<input
				id="betrag"
				type="number"
				step="0.01"
				min="0.01"
				bind:value={betragEur}
				required
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
			/>
		</div>

		<!-- Rechnungsdatum -->
		{#if detail.kind !== 'donation'}
			<div>
				<label for="rechnungsdatum" class="mb-1 block text-sm font-medium text-foreground">
					Rechnungsdatum
				</label>
				<input
					id="rechnungsdatum"
					name="rechnungsdatum"
					type="date"
					lang="de"
					bind:value={rechnungsdatum}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
			</div>
		{/if}

		<!-- Kommentar -->
		<div>
			<label for="kommentar" class="mb-1 block text-sm font-medium text-foreground">Kommentar</label>
			<textarea
				id="kommentar"
				name="kommentar"
				rows="2"
				maxlength={2000}
				bind:value={kommentar}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none resize-none"
			></textarea>
		</div>

		{#if detail.kind === 'expense' && detail.status === 'geprueft' && !detail.erstattetAm}
			<!-- Erstattungsfelder (nur wenn noch nicht erstattet) -->
			<div class="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wide">Erstattung</p>

				<div class="grid grid-cols-2 gap-3">
					<div>
						<label for="erstattetAm" class="mb-1 block text-sm font-medium text-foreground">
							Erstattungsdatum
						</label>
						<input
							id="erstattetAm"
							name="erstattetAm"
							type="date"
							lang="de"
							bind:value={erstattetAm}
							class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
						/>
					</div>
					<div>
						<label for="zahlungsartId" class="mb-1 block text-sm font-medium text-foreground">
							Zahlungsart
						</label>
						<select
							id="zahlungsartId"
							name="zahlungsartId"
							bind:value={zahlungsartId}
							class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
						>
							{#each zahlungsarten as z (z.id)}
								<option value={z.id}>{z.label}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		{/if}

		<!-- Buttons: Save vs Save+Notify (§5.5.1) -->
		<div class="flex flex-wrap gap-3 pt-2">
			<button
				type="submit"
				disabled={saving}
				class="rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm ring-1 ring-border hover:bg-muted disabled:opacity-60 transition-colors"
			>
				{saving ? 'Speichere…' : 'Speichern'}
			</button>

			{#if detail.kind === 'expense' && detail.status === 'geprueft' && !detail.erstattetAm}
				<button
					type="button"
					disabled={savingAndNotifying}
					onclick={async () => {
						savingAndNotifying = true;
						const formData = new FormData();
						formData.set('bezeichnung', bezeichnung);
						formData.set('betragCents', String(betragCents));
						formData.set('rechnungsdatum', rechnungsdatum);
						formData.set('kommentar', kommentar);
						formData.set('erstattetAm', erstattetAm);
						formData.set('zahlungsartId', zahlungsartId);

						const res = await fetch(`?/save-and-notify${kindParam}`, {
							method: 'POST',
							body: formData,
						});
						savingAndNotifying = false;

						if (res.ok) {
							await invalidateAll();
							// Toast with 5s undo indication (mail already sent — best-effort)
							toast.success(`Mail an ${recipientVorname} verschickt.`, {
								description: 'Rückgängig (Undo) reverses erstattet_am — Mail kann nicht zurückgenommen werden.',
								duration: 5000,
							});
						} else {
							const body = await res.json().catch(() => ({}));
							toast.error(body?.data?.error ?? 'Fehler beim Speichern');
						}
					}}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
				>
					{savingAndNotifying ? 'Sende…' : 'Speichern und Mitglied benachrichtigen'}
				</button>
			{/if}
		</div>
	</form>
{/if}
