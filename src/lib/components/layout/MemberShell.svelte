<!--
	MemberShell — the slim chrome for the member self-service portal (Aurora
	A-flow S2a). The lightweight pendant to admin/AdminShell.svelte: a single
	top bar (brand · nav · who) over a scrollable, safe-area-aware main. NO admin
	sidebar / tab bar — a member sees only their own small world.

	Nav grows with the surfaces: S2a shipped "Übersicht" alone so no link was a
	dead end; S2b added the Auslagen surfaces.

	Three pills, not four: at 390px four pills overflowed, so "Einreichen" was
	cut mid-word and "Profil" sat off-screen with nothing hinting it was there.
	Profil now lives on the avatar — the conventional home for "me" — which
	leaves the row fitting on a phone with room to spare. "Meine Auslagen" is
	just "Auslagen" here; inside a member portal everything is theirs.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { LogOut, LayoutDashboard, Plus, Receipt } from '@lucide/svelte';
	import OfflineBanner from '$lib/components/pwa/OfflineBanner.svelte';

	const NAV = [
		{ href: '/portal', label: 'Übersicht', icon: LayoutDashboard, testId: 'uebersicht' },
		{ href: '/portal/auslagen', label: 'Auslagen', icon: Receipt, testId: 'auslagen' },
		{ href: '/portal/auslagen/neu', label: 'Einreichen', icon: Plus, testId: 'einreichen' }
	];

	interface Props {
		/** Display identity from the linked Mitglied row (never the client). */
		member: { vorname: string; nachname: string };
		vereinName: string;
		children: Snippet;
	}

	let { member, vereinName, children }: Props = $props();

	/** Exact match for the hub, prefix match for its sub-surfaces. */
	function isCurrent(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/portal') return path === '/portal';
		if (href === '/portal/auslagen') {
			return path === '/portal/auslagen' || /^\/portal\/auslagen\/(?!neu$)/.test(path);
		}
		return path === href;
	}

	const fullName = $derived(`${member.vorname} ${member.nachname}`.trim());
	const initials = $derived(
		`${member.vorname.at(0) ?? ''}${member.nachname.at(0) ?? ''}`.toUpperCase()
	);
	const onProfil = $derived(page.url.pathname === '/portal/profil');

	/**
	 * Three pills fit at 390px — but a longer label, a bigger font size or a
	 * future fourth surface would silently start cutting again. When the row
	 * really does overflow, fade its right edge so the cut looks like "there is
	 * more, scroll" instead of like a rendering bug.
	 */
	let navEl = $state<HTMLElement | null>(null);
	let scrollable = $state(false);
	$effect(() => {
		const el = navEl;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const check = () => (scrollable = el.scrollWidth > el.clientWidth + 1);
		check();
		const ro = new ResizeObserver(check);
		ro.observe(el);
		return () => ro.disconnect();
	});
</script>

<a
	href="#main-content"
	class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring focus:outline-none"
>
	Zum Inhalt springen
</a>

<div class="bg-wash flex min-h-svh flex-col">
	<header
		class="border-hairline sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md"
		style="padding-top: env(safe-area-inset-top, 0px);"
		data-testid="member-shell-topbar"
	>
		<div class="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-2.5">
			<!-- Brand — returns to the portal home. The public/admin brand uses the
			     same lineart logo; the sublabel marks this as the members' door. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -- static in-app portal routes -->
			<a
				href="/portal"
				class="flex min-h-11 min-w-0 items-center gap-2 rounded-[10px] pr-2 text-ink-900 transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				aria-label="Zur Portal-Startseite"
			>
				<img src="/logo-lineart.svg" alt="" class="h-7 w-7 shrink-0" aria-hidden="true" />
				<span class="flex min-w-0 flex-col leading-tight">
					<span class="truncate text-sm font-semibold tracking-tight" data-env="VEREIN_NAME"
						>{vereinName}</span
					>
					<span class="text-[11px] font-medium text-ink-500">Mitglieder-Portal</span>
				</span>
			</a>

			<div class="ml-auto flex shrink-0 items-center gap-2.5">
				<!-- The avatar IS the profile link — the one place a member expects
				     "my data" to live, and the reason the nav row below can stay at
				     three pills. Active state included: it is a nav destination like
				     any other, it just does not sit in the pill row. -->
				<a
					href="/portal/profil"
					aria-current={onProfil ? 'page' : undefined}
					data-testid="member-nav-profil"
					class="flex min-h-11 items-center gap-2 rounded-full py-1 pr-1 pl-1 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:pr-3 {onProfil
						? 'bg-secondary'
						: 'hover:bg-secondary/60'}"
				>
					<span
						class="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white [background-image:var(--gradient-brand)]"
						aria-hidden="true">{initials}</span
					>
					<span class="hidden flex-col text-left leading-tight sm:flex">
						<span class="text-sm font-semibold text-ink-900" data-testid="member-shell-name"
							>{fullName}</span
						>
						<span class="text-[11px] text-ink-500">Mein Profil</span>
					</span>
					<span class="sr-only sm:hidden">Mein Profil — {fullName}</span>
				</a>
				<form method="POST" action="/sign-out?/signout">
					<button
						type="submit"
						class="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-w-0 sm:justify-start"
						data-testid="member-sign-out"
					>
						<LogOut class="size-4" aria-hidden="true" />
						<span class="hidden sm:inline">Abmelden</span>
					</button>
				</form>
			</div>
		</div>

		<!-- Nav on its own baseline: three pills, never wrapping, still
		     horizontally scrollable as a safety net (with a fade when it actually
		     has something to scroll to). -->
		<div class="mx-auto w-full max-w-3xl px-4 pb-2">
			<nav
				bind:this={navEl}
				class="flex items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				style={scrollable
					? 'mask-image:linear-gradient(to right,#000 calc(100% - 32px),transparent);-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 32px),transparent)'
					: undefined}
				aria-label="Portal-Navigation"
			>
				{#each NAV as item (item.href)}
					{@const Icon = item.icon}
					<a
						href={item.href}
						aria-current={isCurrent(item.href) ? 'page' : undefined}
						data-testid="member-nav-{item.testId}"
						class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-3
							{isCurrent(item.href)
							? 'bg-secondary text-ink-700'
							: 'text-ink-500 hover:bg-secondary/60 hover:text-ink-700'}"
					>
						<Icon class="size-4" aria-hidden="true" />
						{item.label}
					</a>
				{/each}
			</nav>
		</div>
	</header>

	<main
		id="main-content"
		class="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]"
	>
		{@render children()}
	</main>
</div>

<OfflineBanner />
