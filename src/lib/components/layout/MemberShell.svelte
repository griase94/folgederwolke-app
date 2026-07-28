<!--
	MemberShell — the slim chrome for the member self-service portal (Aurora
	A-flow S2a). The lightweight pendant to admin/AdminShell.svelte: a single
	top bar (brand · nav · who) over a scrollable, safe-area-aware main. NO admin
	sidebar / tab bar — a member sees only their own small world.

	The bottom nav items (Auslage einreichen, Meine Auslagen) arrive in S2b with
	those surfaces; S2a ships "Übersicht" only so no link is a dead end.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { LogOut, LayoutDashboard } from '@lucide/svelte';
	import OfflineBanner from '$lib/components/pwa/OfflineBanner.svelte';

	interface Props {
		/** Display identity from the linked Mitglied row (never the client). */
		member: { vorname: string; nachname: string };
		vereinName: string;
		children: Snippet;
	}

	let { member, vereinName, children }: Props = $props();

	const fullName = $derived(`${member.vorname} ${member.nachname}`.trim());
	const initials = $derived(
		`${member.vorname.at(0) ?? ''}${member.nachname.at(0) ?? ''}`.toUpperCase()
	);
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
				class="flex min-h-11 items-center gap-2 rounded-[10px] pr-2 text-ink-900 transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				aria-label="Zur Portal-Startseite"
			>
				<img src="/logo-lineart.svg" alt="" class="h-7 w-7 shrink-0" aria-hidden="true" />
				<span class="flex flex-col leading-tight">
					<span class="text-sm font-semibold tracking-tight" data-env="VEREIN_NAME"
						>{vereinName}</span
					>
					<span class="text-[11px] font-medium text-ink-500">Mitglieder-Portal</span>
				</span>
			</a>

			<nav class="ml-2 hidden items-center gap-1 sm:flex" aria-label="Portal-Navigation">
				<a
					href="/portal"
					aria-current="page"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-sm font-medium text-ink-700"
				>
					<LayoutDashboard class="size-4" aria-hidden="true" />
					Übersicht
				</a>
			</nav>

			<div class="ml-auto flex items-center gap-2.5">
				<div class="flex items-center gap-2 text-right">
					<span
						class="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white [background-image:var(--gradient-brand)]"
						aria-hidden="true">{initials}</span
					>
					<span class="hidden flex-col leading-tight sm:flex">
						<span class="text-sm font-semibold text-ink-900" data-testid="member-shell-name"
							>{fullName}</span
						>
						<span class="text-[11px] text-ink-500">Mitglied</span>
					</span>
				</div>
				<form method="POST" action="/sign-out?/signout">
					<button
						type="submit"
						class="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						data-testid="member-sign-out"
					>
						<LogOut class="size-4" aria-hidden="true" />
						<span class="hidden sm:inline">Abmelden</span>
					</button>
				</form>
			</div>
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
