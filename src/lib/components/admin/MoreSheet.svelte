<!--
  MoreSheet — mobile bottom-sheet listing the secondary nav destinations
  that moved out of the bottom tab bar after the IA shift (Zone-A 2026-05-21).
  Items shown: Mitglieder, Rechnungen, Kunden, Jahresabschluss, Einstellungen,
  DSGVO.

  Triggered by the "Mehr" tab in MobileTabBar.

  A11y notes:
  - shadcn-svelte Sheet wraps bits-ui Dialog → focus is trapped while open,
    ESC closes, focus returns to the trigger on close.
  - Each link is rendered as role="menuitem" so screen-reader rotors group
    the destinations together (mirrors the FabBottomSheet contract).
  - The sheet honours safe-area-inset-bottom so the last item sits above
    the home indicator on devices that have one.
-->
<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import UsersIcon from '@lucide/svelte/icons/users';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import type { Component } from 'svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	type Item = { href: string; label: string; icon: Component };
	const ITEMS: Item[] = [
		{ href: '/app/mitglieder', label: 'Mitglieder', icon: UsersIcon },
		{ href: '/app/rechnungen', label: 'Rechnungen', icon: FileTextIcon },
		{ href: '/app/kunden', label: 'Kunden', icon: Building2Icon },
		{ href: '/app/jahresabschluss', label: 'Jahresabschluss', icon: BookOpenIcon },
		{ href: '/app/einstellungen', label: 'Einstellungen', icon: SettingsIcon },
		{ href: '/app/dsgvo', label: 'DSGVO', icon: ShieldIcon },
	];

	function onSelect(): void {
		// Close eagerly so SvelteKit anchor navigation feels snappy on flaky
		// networks (same pattern as FabBottomSheet).
		open = false;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),1rem)] dark:border-border"
		data-testid="more-sheet"
	>
		<Sheet.Header class="pt-2">
			<!-- Drag handle (visual only) — matches FabBottomSheet -->
			<div
				aria-hidden="true"
				class="mx-auto mb-1 h-1 w-9 rounded-full bg-muted-foreground/30"
			></div>
			<Sheet.Title class="text-left text-base font-semibold">Mehr</Sheet.Title>
			<Sheet.Description class="text-left text-xs text-muted-foreground">
				Weitere Navigationspunkte
			</Sheet.Description>
		</Sheet.Header>

		<nav class="grid gap-1 px-2 pb-2" aria-label="Weitere Navigation">
			{#each ITEMS as item (item.href)}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={item.href}
					role="menuitem"
					onclick={onSelect}
					class="flex min-h-[56px] items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-muted/40"
					data-testid="more-sheet-link"
					data-href={item.href}
				>
					<span
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
						aria-hidden="true"
					>
						<item.icon size={20} strokeWidth={2} />
					</span>
					<span class="flex-1">{item.label}</span>
					<svg
						class="h-4 w-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
					</svg>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/each}
		</nav>
	</Sheet.Content>
</Sheet.Root>
