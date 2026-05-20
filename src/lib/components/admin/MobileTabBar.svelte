<script lang="ts">
	import { page } from '$app/stores';
	import { mobileTabItems } from './nav-registry.js';
	import FabBottomSheet from './FabBottomSheet.svelte';

	function isActive(href: string): boolean {
		const current = $page.url.pathname;
		if (href === '/app') return current === '/app';
		return current.startsWith(href);
	}

	// Icon SVG paths used by mobile tab items
	const ICONS: Record<string, string> = {
		CheckSquare:
			'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
		Inbox:
			'M22 12h-6l-2 3H10l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
		CreditCard:
			'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM2 11h20',
		Users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
	};

	let sheetOpen = $state(false);
</script>

<!--
  Mobile bottom tab bar.
  Visible only on screens < md (768px).

  safe-area-inset-bottom: ensures content isn't hidden behind the iPhone
  home indicator. We pad the *bar* (not just an inner spacer) so the
  background extends behind the indicator on devices that need it.
-->
<!--
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
		{@const active = isActive(item.href)}
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
