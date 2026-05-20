<script lang="ts">
	import UebersichtTab from '$lib/components/admin/jahresabschluss/UebersichtTab.svelte';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<UebersichtTab {data} {form} />
