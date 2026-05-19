<!--
  InvoiceLivePreview - debounced (500ms) HTML preview of the invoice as the
  admin types. Side-by-side on desktop, stacked on mobile (parent handles
  the layout grid).

  Wires to a tiny POST endpoint that returns rendered HTML so the preview
  layout stays in sync with the actual PDF template via one source. The
  debounce keeps key-press load on the server reasonable.
-->
<script lang="ts">
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
	let timer: ReturnType<typeof setTimeout> | null = $state(null);

	async function refresh(): Promise<void> {
		loading = true;
		try {
			const res = await fetch('/app/rechnungen/new?/preview', {
				method: 'POST',
				headers: { accept: 'application/json' },
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
				const data = await res.json();
				// SvelteKit wraps action responses in { type: 'success', data: {...} }
				const payload = data?.data ?? data;
				let parsed: unknown = payload;
				if (typeof payload === 'string') {
					try {
						parsed = JSON.parse(payload);
					} catch {
						parsed = payload;
					}
				}
				if (parsed && typeof parsed === 'object' && 'html' in parsed) {
					html = String((parsed as { html: unknown }).html);
				} else if (typeof parsed === 'string') {
					html = parsed;
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

<div class="rounded-xl border border-border bg-muted/30 p-4">
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
