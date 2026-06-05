<!--
  DerivedKategorieBadge — the read-only derived-Kategorie hint (spec §9.2 + §13).

  Spenden have NO Kategorie picker: the booking Kategorie + Sphäre are DERIVED
  from (Spendenart, Zweckbindung). This styled hint surfaces the three facts the
  admin needs to trust the booking:
    - Sphäre   : always "Ideeller" (§4.5 — donation sphere is constant)
    - Kategorie: deriveDonationKategorieName(spendeKind, zweckbindungKind)
    - Anlage-Gem Zeile: shown only when a Zeile is known (degrades gracefully)

  Pure presentational — no DB, no form value (the server derives authoritatively
  in createDonation; this is the operator-facing explanation, not an input).
-->
<script lang="ts">
	import {
		deriveDonationKategorieName,
		type SpendeKind,
		type ZweckbindungKind
	} from '$lib/domain/spenden-kategorie.js';

	interface Props {
		spendeKind: SpendeKind;
		zweckbindungKind: ZweckbindungKind;
		/** The Anlage-Gem-Zeile for this Kategorie, when known; null degrades gracefully. */
		anlageGemZeile?: number | null;
	}

	let { spendeKind, zweckbindungKind, anlageGemZeile = null }: Props = $props();

	const kategorieName = $derived(deriveDonationKategorieName(spendeKind, zweckbindungKind));
</script>

<div
	data-testid="derived-kategorie-badge"
	class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
>
	<p class="mb-1 text-xs font-medium text-muted-foreground">Wird gebucht als</p>
	<p class="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-foreground">
		<span class="font-medium">Ideeller</span>
		<span aria-hidden="true" class="text-muted-foreground">·</span>
		<span>Kategorie {kategorieName}</span>
		{#if anlageGemZeile != null}
			<span aria-hidden="true" class="text-muted-foreground">·</span>
			<span class="text-muted-foreground">Anlage Gem Zeile {anlageGemZeile}</span>
		{/if}
	</p>
</div>
