<script lang="ts">
	/**
	 * StatusChip — incompleteness chip (master §2.6, spec §9.5): "Beleg
	 * fehlt", "ohne Kategorie" visible wherever the record appears. Amber
	 * severity tokens — brand pink is BANNED from warnings (spec §2).
	 * Unknown kinds render verbatim (escape hatch for feature passes).
	 */
	let { kind }: { kind: 'beleg-fehlt' | 'ohne-kategorie' | string } = $props();

	const LABELS: Record<string, string> = {
		'beleg-fehlt': 'Beleg fehlt',
		'ohne-kategorie': 'ohne Kategorie'
	};
	const label = $derived(LABELS[kind] ?? kind);
</script>

<span
	data-kind={kind}
	class="inline-flex items-center rounded-full bg-severity-warn/15 px-2 py-0.5 text-[11px] font-medium text-severity-warn-text"
	>{label}</span
>
