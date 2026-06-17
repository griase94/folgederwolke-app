<!--
  MobileTabBar — Aurora five-cell bar (spec §5, option B):
  Übersicht · Transaktionen · ⊕ · Prüfung · Mehr.

  The five cells are SPEC-FIXED and hardcoded here — nav-registry carries
  desktop IA only. mobileTransaktionenActive() (registry) is the shared
  Transaktionen active-predicate. Slice phasing: the Transaktionen href
  stays /app/ausgaben until slice 5 flips it to /app/transaktionen.

  Active-state rules (spec §5): Transaktionen spans the feed + three type
  routes + details · Prüfung spans inbox + details · Mehr is active on all
  sheet-grid destinations · tapping the already-active tab pops to its root
  (the href IS the root; an exact-root re-tap scrolls to top).

  ⊕: raised 52px circle, full-strength brand gradient (sanctioned slot in
  the §2 gradient budget) — opens CreateSheet. Mehr opens MehrSheet. Both
  via pushState (history entry consumed on dismiss, spec §5).

  Badge: page.data.openAuslagenCount (layout load, Task 2.5), capped "9+".
  Glass + hairline fixed surface; .nav-safe-bottom keeps the bar above the
  home indicator. Visible only < md.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { preloadData, pushState } from '$app/navigation';
	import { mobileTransaktionenActive } from './nav-registry.js';
	import CreateSheet from './CreateSheet.svelte';
	import MehrSheet from './MehrSheet.svelte';

	// Every destination reachable from the Mehr sheet (tiles + footer) —
	// the Mehr cell lights up on all of them (spec §5 active-state rules).
	const MEHR_DESTINATIONS = [
		'/app/projekte',
		'/app/mitglieder',
		'/app/jahresabschluss',
		'/app/rechnungen',
		'/app/kunden',
		'/app/einstellungen',
		'/app/dsgvo'
	];

	const path = $derived(page.url.pathname);
	const uebersichtActive = $derived(path === '/app');
	const transaktionenActive = $derived(mobileTransaktionenActive(path));
	const pruefungActive = $derived(path === '/app/inbox' || path.startsWith('/app/inbox/'));
	const mehrActive = $derived(
		MEHR_DESTINATIONS.some((h) => path === h || path.startsWith(h + '/'))
	);

	const badge = $derived((): string | null => {
		const n = (page.data['openAuslagenCount'] as number | undefined) ?? 0;
		if (n <= 0) return null;
		return n > 9 ? '9+' : String(n);
	});

	function onTabClick(e: MouseEvent, href: string): void {
		// Already at this tab's ROOT: scroll to top instead of a same-URL
		// navigation. Deeper inside the tab, the default anchor nav to the
		// root href IS the pop-to-root (spec §5).
		if (page.url.pathname === href) {
			e.preventDefault();
			document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function openCreate(): void {
		pushState('', { createSheet: true });
	}
	function openMehr(): void {
		pushState('', { mehrSheet: true });
	}

	// Speculative prefetch — on idle, preload the top 2 non-active tab routes.
	const PREFETCH_HREFS = ['/app', '/app/ausgaben', '/app/inbox'];

	onMount(() => {
		const schedule = (cb: () => void) => {
			if ('requestIdleCallback' in window) {
				window.requestIdleCallback(cb, { timeout: 2000 });
			} else {
				setTimeout(cb, 0);
			}
		};
		schedule(() => {
			const current = page.url.pathname;
			const candidates = PREFETCH_HREFS.filter((href) =>
				href === '/app' ? current !== '/app' : !current.startsWith(href)
			);
			for (const href of candidates.slice(0, 2)) {
				preloadData(href).catch(() => {
					// Best-effort — silently ignore network errors.
				});
			}
		});
	});

	// Icon SVG paths (lucide outlines).
	const ICONS: Record<string, string> = {
		LayoutDashboard:
			'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
		ArrowLeftRight: 'M8 3L4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4',
		Inbox:
			'M22 12h-6l-2 3H10l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
	};

	const cellClass = (active: boolean): string =>
		'flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
		(active ? 'text-primary-text' : 'text-ink-500');
</script>

<nav
	class="nav-safe-bottom surface-glass fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-hairline md:hidden"
	aria-label="Mobile Navigation"
>
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<!-- 1 · Übersicht -->
	<a
		href="/app"
		class={cellClass(uebersichtActive)}
		aria-current={uebersichtActive ? 'page' : undefined}
		onclick={(e) => onTabClick(e, '/app')}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width={uebersichtActive ? '2.5' : '2'}
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d={ICONS['LayoutDashboard']} />
		</svg>
		<span class="whitespace-nowrap leading-tight">Übersicht</span>
	</a>

	<!-- 2 · Transaktionen (href stays /app/ausgaben until slice 5) -->
	<a
		href="/app/ausgaben"
		class={cellClass(transaktionenActive)}
		aria-current={transaktionenActive ? 'page' : undefined}
		onclick={(e) => onTabClick(e, '/app/ausgaben')}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width={transaktionenActive ? '2.5' : '2'}
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d={ICONS['ArrowLeftRight']} />
		</svg>
		<span class="whitespace-nowrap leading-tight">Transaktionen</span>
	</a>

	<!-- 3 · ⊕ raised center — full-strength gradient (sanctioned §2 budget slot) -->
	<div class="flex items-start justify-center">
		<button
			type="button"
			aria-label="Neu erfassen"
			aria-haspopup="dialog"
			aria-expanded={page.state.createSheet === true}
			onclick={openCreate}
			class="-mt-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-brand transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			data-testid="mobile-tab-plus"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M12 5v14M5 12h14" />
			</svg>
		</button>
	</div>

	<!-- 4 · Prüfung (+ numeric badge, capped 9+) -->
	<div class="relative flex items-stretch">
		<a
			href="/app/inbox"
			class={cellClass(pruefungActive) + ' flex-1'}
			aria-current={pruefungActive ? 'page' : undefined}
			aria-label={badge()
				? `Prüfung, ${page.data['openAuslagenCount']} offene Auslagen`
				: undefined}
			onclick={(e) => onTabClick(e, '/app/inbox')}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="22"
				height="22"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width={pruefungActive ? '2.5' : '2'}
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d={ICONS['Inbox']} />
			</svg>
			<span class="whitespace-nowrap leading-tight">Prüfung</span>
		</a>
		{#if badge()}
			<!-- Badge is outside the <a> so it doesn't pollute textContent -->
			<span
				class="pointer-events-none absolute right-[calc(50%-20px)] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-strong px-1 text-[10px] font-bold leading-none text-white"
				data-testid="pruefung-badge"
				aria-hidden="true">{badge()}</span
			>
		{/if}
	</div>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

	<!-- 5 · Mehr — opens MehrSheet -->
	<button
		type="button"
		class={cellClass(mehrActive)}
		aria-label="Mehr Bereiche"
		aria-haspopup="dialog"
		aria-expanded={page.state.mehrSheet === true}
		onclick={openMehr}
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
		<span class="whitespace-nowrap leading-tight">Mehr</span>
	</button>
</nav>

<!-- Sheets render via portal over the whole viewport; their open state is
     page.state (shallow routing) — no bindings needed here. -->
<CreateSheet />
<MehrSheet />
