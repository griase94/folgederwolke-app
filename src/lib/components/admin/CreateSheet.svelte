<!--
  CreateSheet — the ⊕ type-chooser (spec §5): Ausgabe / Einnahme / Spende
  tiles → the existing per-type create routes (full-screen takeovers outside
  the tab-bar shell). Type accents from the --color-type-* token family
  (spec §2.4 row contract: Ausgabe rose/plum ↓ · Einnahme green ↑ · Spende
  violet ♥). History/motion/a11y contract identical to MehrSheet.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import type { Component } from 'svelte';

	const open = $derived(page.state.createSheet === true);

	// Focus-return (spec §5 keyboard/SR): pushState opens the sheet, which
	// bypasses bits-ui's trigger tracking — so Esc/back close won't restore
	// focus to the ⊕ tab-bar button on its own. Capture the element that had
	// focus at open time (the ⊕ trigger, which the user just activated) and
	// restore it on dismiss. Task 2.20's checklist verifies this on device.
	let triggerEl: HTMLElement | null = null;
	$effect(() => {
		if (open && triggerEl === null) {
			triggerEl = document.activeElement as HTMLElement | null;
		} else if (!open) {
			triggerEl = null;
		}
	});

	function dismiss(): void {
		// Idempotent: only pop history when WE own the top entry, so a double
		// dismiss (Esc + drag, or back + close) never runs history.back() twice.
		if (page.state.createSheet !== true) return;
		const t = triggerEl;
		history.back();
		// Restore focus to the ⊕ trigger after the state settles.
		setTimeout(() => t?.focus?.(), 0);
	}

	function navigate(href: string): void {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(href, { replaceState: true });
	}

	type Tile = { href: string; label: string; icon: Component; chip: string };
	const TILES: Tile[] = [
		{
			href: '/app/ausgaben/neu',
			label: 'Ausgabe',
			icon: MinusIcon,
			chip: 'bg-type-ausgabe-tint text-type-ausgabe'
		},
		{
			href: '/app/einnahmen/neu',
			label: 'Einnahme',
			icon: PlusIcon,
			chip: 'bg-type-einnahme-tint text-type-einnahme'
		},
		{
			href: '/app/spenden/neu',
			label: 'Spende',
			icon: HeartIcon,
			chip: 'bg-type-spende-tint text-type-spende'
		}
	];
</script>

<Sheet.Root bind:open={() => open, (v) => { if (!v) dismiss(); }}>
	<Sheet.Content
		side="bottom"
		showCloseButton={false}
		class="fdw-sheet-bottom gap-0 rounded-t-2xl border-hairline bg-background pb-[max(env(safe-area-inset-bottom),1rem)]"
		data-testid="create-sheet"
	>
		<div class="pb-2 pt-2">
			<div aria-hidden="true" class="mx-auto h-1 w-9 rounded-full bg-ink-300/50"></div>
		</div>

		<Sheet.Title class="px-4 text-left text-base font-semibold text-ink-900">Neu erfassen</Sheet.Title>
		<Sheet.Description class="px-4 text-left text-xs text-ink-500">
			Was möchtest du anlegen?
		</Sheet.Description>

		<nav class="grid grid-cols-3 gap-2 px-4 pb-2 pt-3" aria-label="Neu erfassen">
			{#each TILES as tile (tile.href)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={tile.href}
					onclick={(e) => {
						e.preventDefault();
						navigate(tile.href);
					}}
					class="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border border-hairline px-1 py-3 text-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					data-testid="create-tile"
				>
					<span
						class="flex h-11 w-11 items-center justify-center rounded-xl {tile.chip}"
						aria-hidden="true"
					>
						<tile.icon size={20} strokeWidth={2.25} />
					</span>
					<span class="text-sm font-medium text-ink-700">{tile.label}</span>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
		</nav>
	</Sheet.Content>
</Sheet.Root>
