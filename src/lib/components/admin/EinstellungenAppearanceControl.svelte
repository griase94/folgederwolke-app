<!--
	EinstellungenAppearanceControl — the minimal light/dark/system switch (F1).

	Client island living inside the Einstellungen → Darstellung section. It uses
	mode-watcher for the live class + store, and mirrors the choice into the
	`fdw_mode` cookie so the NEXT server render stamps `.dark` flash-free
	(hooks.server.ts). The full "Darstellung" hub design lands in Flow G — this
	is function + kit conformance only.
-->
<script lang="ts">
	import { SegmentedControl } from '$lib/components/ui/segmented-control/index.js';
	import { userPrefersMode, setMode } from 'mode-watcher';
	import { MODE_COOKIE, type ThemeMode } from '$lib/themes/index.js';

	let { initialMode }: { initialMode: ThemeMode } = $props();

	const options = [
		{ value: 'light', label: 'Hell' },
		{ value: 'dark', label: 'Dunkel' },
		{ value: 'system', label: 'System' }
	];

	// Before hydration `userPrefersMode.current` is undefined → fall back to the
	// cookie-derived `initialMode` from the server so SSR and first client paint
	// agree (no radio-flicker). After hydration it reflects the live choice.
	const selected = $derived((userPrefersMode.current ?? initialMode) as string);

	function choose(next: string) {
		setMode(next as ThemeMode);
		// Mirror to the cookie so the next SSR renders `.dark` server-side.
		document.cookie = `${MODE_COOKIE}=${next}; path=/; max-age=31536000; SameSite=Lax`;
	}
</script>

<div
	class="flex flex-wrap items-center justify-between gap-3"
	data-testid="appearance-control"
>
	<span class="text-sm font-medium text-foreground">Modus</span>
	<SegmentedControl
		{options}
		value={selected}
		onChange={choose}
		ariaLabel="Darstellungsmodus"
		data-testid="mode-segmented"
	/>
</div>
