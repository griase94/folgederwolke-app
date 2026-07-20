<!--
	InvoiceMarkPaidRow — inline mark-paid panel (NOT a modal).

	Used in two places:
	  - /app/rechnungen/[id] detail page, below the action bar.
	  - /app/rechnungen list-page row, expanded under the kebab trigger.

	Layout: a card with sanity-check <dl> (Kunde + Bezeichnung + brutto),
	a single required DateField (defaults to today, no future dates), a
	subtext explaining the auto-created income row, and a Markieren /
	Abbrechen button pair.

	The form POSTs to the parent route's mark-paid action (`actionUrl`).
	The parent owns the route action; this component is dumb UI.

	Phase 12-C.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import DateField from '$lib/components/ui/date-field/DateField.svelte';

	type Props = {
		invoiceId: string;
		businessId: string;
		customerName: string;
		bezeichnung: string;
		bruttoCents: number;
		rechnungsdatum: string;
		actionUrl: string;
		today: string;
		onCancel?: () => void;
	};

	let {
		invoiceId,
		businessId,
		customerName,
		bezeichnung,
		bruttoCents,
		rechnungsdatum,
		actionUrl,
		today,
		onCancel
	}: Props = $props();

	const bruttoFmt = $derived(
		(bruttoCents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: 'EUR',
			minimumFractionDigits: 2
		})
	);

	const datumFmt = $derived.by(() => {
		const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rechnungsdatum);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : rechnungsdatum;
	});

	const paymentYear = $derived.by(() => {
		const m = /^(\d{4})-/.exec(today);
		return m ? m[1] : String(new Date().getFullYear());
	});

	function handleCancel(): void {
		onCancel?.();
	}
</script>

<div
	class="rounded-b-xl border-x border-b border-dashed border-border bg-secondary/60 p-4"
	data-testid="invoice-mark-paid-row"
	data-invoice-id={invoiceId}
>
	<form method="POST" action={actionUrl} class="space-y-4">
		<input type="hidden" name="invoiceId" value={invoiceId} />

		<dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
			<div>
				<dt class="text-[11px] font-bold uppercase tracking-wider text-ink-300">Kund:in</dt>
				<dd class="mt-0.5 font-medium text-ink-900">{customerName}</dd>
			</div>
			<div>
				<dt class="text-[11px] font-bold uppercase tracking-wider text-ink-300">Bezeichnung</dt>
				<dd class="mt-0.5 font-medium text-ink-900">{bezeichnung}</dd>
			</div>
			<div>
				<dt class="text-[11px] font-bold uppercase tracking-wider text-ink-300">Brutto</dt>
				<dd class="mt-0.5 font-medium tabular-nums text-type-einnahme">{bruttoFmt}</dd>
			</div>
		</dl>

		<div class="max-w-[12rem]">
			<label for="bezahlt-am-{invoiceId}" class="mb-1 block text-xs font-medium text-ink-700">
				Bezahlt am
			</label>
			<DateField
				id="bezahlt-am-{invoiceId}"
				name="bezahltAm"
				value={today}
				max={today}
				required
			/>
			<p class="mt-1 text-xs text-ink-500">Rechnungsdatum: {datumFmt}</p>
		</div>

		<p class="text-xs text-ink-500">
			Erstellt automatisch eine Einnahme E-{paymentYear}-NNN über {bruttoFmt} — heute noch rückgängig machbar.
		</p>

		<div class="flex flex-wrap items-center gap-2">
			<Button
				type="submit"
				data-testid="invoice-mark-paid-submit"
				class="bg-type-einnahme text-white hover:bg-type-einnahme/90"
			>
				<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
				Als bezahlt markieren
			</Button>
			<Button type="button" variant="ghost" onclick={handleCancel}>Abbrechen</Button>
			<span class="ml-auto font-mono text-xs text-ink-300">{businessId}</span>
		</div>
	</form>
</div>
