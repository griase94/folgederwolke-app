<script lang="ts">
	/**
	 * FactsList — the `.facts` block: a `<dl>` that establishes the `--facts-lbl`
	 * label ruler so every KeyValue row aligns its value on ONE right rail
	 * (ANDY-LENS §1 / Präzisierung: all values right on one ruler).
	 */
	import type { Snippet } from "svelte";

	let {
		lblWidth = "140px",
		children,
	}: { lblWidth?: string; children: Snippet } = $props();
</script>

<dl style="--facts-lbl: {lblWidth};" data-slot="facts-list">
	{@render children()}
</dl>
