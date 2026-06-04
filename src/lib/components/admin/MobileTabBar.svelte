<script lang="ts">
	import { page } from '$app/stores';
	import { mobileTabItems, mobileTransaktionenActive } from './nav-registry.js';
	import FabBottomSheet from './FabBottomSheet.svelte';
	import MoreSheet from './MoreSheet.svelte';

	function isActive(href: string): boolean {
		const current = $page.url.pathname;
		if (href === '/app') return current === '/app';
		return current.startsWith(href);
	}

	// Icon SVG paths used by mobile tab items.
	// Zone-A 2026-05-21 — added FolderOpen for Projekte (now in bottom bar).
	const ICONS: Record<string, string> = {
		CheckSquare:
			'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
		FolderOpen:
			'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
		CreditCard:
			'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM2 11h20',
		MinusCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8',
		PlusCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8M12 8v8',
		Gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
		Inbox:
			'M22 12h-6l-2 3H10l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
	};

	let sheetOpen = $state(false);
	let moreOpen = $state(false);
</script>

<!--
  Mobile bottom tab bar.
  Visible only on screens < md (768px).

  Zone-A 2026-05-21 — revised 6-cell geometry: 4 nav tabs (Übersicht /
  Projekte / Transaktionen / Belegprüfung) + Mehr trigger + FAB. Mitglieder
  + secondary destinations move to MoreSheet to keep cells comfortable on a
  390px viewport.

  safe-area-inset-bottom: ensures content isn't hidden behind the iPhone
  home indicator. We pad the *bar* (not just an inner spacer) so the
  background extends behind the indicator on devices that need it.

  C7-9 — the `.nav-safe-bottom` utility (defined in app.css) is the
  documented single source of truth for bottom-bar safe-area padding;
  drop the duplicate `pb-[env(safe-area-inset-bottom,0px)]` arbitrary
  value so we don't risk the two diverging.
-->
<nav
	class="nav-safe-bottom fixed bottom-0 left-0 right-0 z-40 flex border-t border-border bg-background md:hidden"
	aria-label="Mobile Navigation"
>
	{#each mobileTabItems as item (item.href)}
		{@const active =
			item.href === '/app/ausgaben'
				? mobileTransaktionenActive($page.url.pathname)
				: isActive(item.href)}
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={item.href}
			class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors"
			class:text-primary={active}
			class:text-muted-foreground={!active}
			aria-current={active ? 'page' : undefined}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width={active ? '2.5' : '2'}
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d={ICONS[item.icon] ?? ''} />
			</svg>
			<span>{item.label}</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/each}

	<!-- "Mehr" trigger — opens MoreSheet with Mitglieder + secondary nav -->
	<button
		type="button"
		class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label="Mehr Navigationspunkte"
		aria-haspopup="dialog"
		aria-expanded={moreOpen}
		onclick={() => (moreOpen = true)}
		data-testid="mobile-tab-mehr"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="1" />
			<circle cx="19" cy="12" r="1" />
			<circle cx="5" cy="12" r="1" />
		</svg>
		<span>Mehr</span>
	</button>

	<!-- Quick-add FAB — opens FabBottomSheet (PM-003) -->
	<button
		type="button"
		class="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label="Neu erfassen"
		aria-haspopup="menu"
		aria-expanded={sheetOpen}
		onclick={() => (sheetOpen = true)}
	>
		<span
			class="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-primary-foreground"
			aria-hidden="true"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M12 5v14M5 12h14" />
			</svg>
		</span>
		<span>Neu</span>
	</button>
</nav>

<!-- Bottom sheet for the FAB. Rendered outside the nav so the Sheet's
     portal overlays the entire viewport, not just the tab bar. -->
<FabBottomSheet bind:open={sheetOpen} />

<!-- "Mehr" bottom sheet — Mitglieder + secondary nav destinations.
     Triggered by the data-testid="mobile-tab-mehr" button above. -->
<MoreSheet bind:open={moreOpen} />
