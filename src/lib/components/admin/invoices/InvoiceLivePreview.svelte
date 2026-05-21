<!--
  InvoiceLivePreview - debounced (500ms) HTML preview of the invoice as the
  admin types. Side-by-side on desktop, stacked on mobile (parent handles
  the layout grid).

  Wires to a tiny POST endpoint that returns rendered HTML so the preview
  layout stays in sync with the actual PDF template via one source. The
  debounce keeps key-press load on the server reasonable.
-->
<script lang="ts">
	import { deserialize } from '$app/forms';

	type PreviewInput = {
		customerId: string;
		customerName: string;
		customerAddressBlock: string | null;
		rechnungsdatum: string;
		leistungsDatum: string | null;
		faelligkeitsDatum: string | null;
		bezeichnung: string;
		leistungsBeschreibung: string | null;
		nettoCents: number;
		currency: string;
	};

	let { input }: { input: PreviewInput } = $props();

	let html = $state('<div class="text-sm text-muted-foreground">Tippe Daten ein …</div>');
	let loading = $state(false);
	// Plain local variable — NOT reactive. Wrapping the debounce timer in
	// $state caused effect_update_depth_exceeded: the $effect below assigns
	// to `timer`, which the framework treated as a dependency update, which
	// re-ran the effect, which re-assigned `timer`, ad infinitum. The timer
	// is implementation detail, not UI state.
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function refresh(): Promise<void> {
		loading = true;
		try {
			const res = await fetch('/app/rechnungen/new?/preview', {
				method: 'POST',
				headers: { accept: 'application/json', 'x-sveltekit-action': 'true' },
				body: new URLSearchParams({
					customerName: input.customerName,
					customerAddressBlock: input.customerAddressBlock ?? '',
					rechnungsdatum: input.rechnungsdatum,
					leistungsDatum: input.leistungsDatum ?? '',
					faelligkeitsDatum: input.faelligkeitsDatum ?? '',
					bezeichnung: input.bezeichnung,
					leistungsBeschreibung: input.leistungsBeschreibung ?? '',
					nettoCents: String(input.nettoCents),
					currency: input.currency
				})
			});
			if (res.ok) {
				// SvelteKit form actions return devalue-serialized payloads.
				// `deserialize` reverses the array-pointer format so we can read
				// `.data.html`. Manual JSON.parse() would only see the outer
				// array-pointer envelope and silently lose the HTML string.
				const result = deserialize<{ html: string }, undefined>(await res.text());
				if (result.type === 'success' && result.data?.html) {
					html = result.data.html;
				}
			}
		} catch (err) {
			console.error('[InvoiceLivePreview] refresh failed:', err);
		} finally {
			loading = false;
		}
	}

	// Debounce input changes — Svelte $effect tracks all destructured fields.
	$effect(() => {
		const _ = JSON.stringify(input);
		void _;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			void refresh();
		}, 500);
	});
</script>

<div class="rounded-xl border border-border bg-muted/30 p-4" data-component="invoice-live-preview">
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-sm font-semibold text-foreground">Vorschau</h2>
		{#if loading}
			<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
				<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"></span>
				aktualisiert …
			</span>
		{/if}
	</div>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<div class="overflow-auto">{@html html}</div>
</div>
