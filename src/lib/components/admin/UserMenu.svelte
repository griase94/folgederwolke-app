<!--
  UserMenu — dropdown surfacing user identity + Einstellungen, Hilfe, version,
  and Abmelden.

  Zone-A 2026-05-21 — extended for the IA shift:
  - Added Einstellungen + Hilfe (→ /app/dsgvo) links.
  - Added version footer (PUBLIC_COMMIT_SHA, short hash, falls back to "dev").
  - Optional `variant="sidebar"` switches the trigger to a user-card surface
    that Sidebar renders at its bottom. When the trigger is in the sidebar,
    it carries a distinct aria-label + data-testid so existing topbar tests
    don't collide on the original "Benutzermenü öffnen" selector.
-->
<script lang="ts">
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuLabel,
		DropdownMenuSeparator,
		DropdownMenuTrigger,
	} from '$lib/components/ui/dropdown-menu/index.js';
	import type { SessionUser } from '$lib/server/auth/index.js';

	interface Props {
		user: SessionUser;
		/**
		 * "topbar" (default) — circular avatar trigger in the topbar.
		 * "sidebar"          — full user-card trigger (avatar + name + email)
		 *                      used at the bottom of the desktop sidebar.
		 */
		variant?: 'topbar' | 'sidebar';
		/** Collapsed sidebar mode (icon-only on tablet 768–1023px) */
		collapsed?: boolean;
	}

	let { user, variant = 'topbar', collapsed = false }: Props = $props();

	/** Derive initials from name or email */
	function initials(u: SessionUser): string {
		if (u.name) {
			const parts = u.name.trim().split(/\s+/);
			const first = parts[0] ?? '';
			const last = parts.length >= 2 ? (parts[parts.length - 1] ?? '') : '';
			if (parts.length >= 2 && first && last) {
				return (first[0]! + last[0]!).toUpperCase();
			}
			return u.name.slice(0, 2).toUpperCase();
		}
		return u.email.slice(0, 2).toUpperCase();
	}

	const abbr = $derived(initials(user));
	const displayName = $derived(user.name ?? user.email);

	// Version label — short commit SHA from PUBLIC_COMMIT_SHA env var, falling
	// back to "dev" when running locally without a real deployment. Read via
	// import.meta.env so it lands in the client bundle at build time.
	const rawSha = (
		(import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[
			'PUBLIC_COMMIT_SHA'
		] ?? 'dev'
	).toString();
	const appVersion = rawSha.length > 7 ? rawSha.slice(0, 7) : rawSha;

	// IDs that vary by variant so the sidebar trigger doesn't collide with the
	// topbar trigger in the same page (both render at desktop breakpoints).
	// Distinct aria-labels keep Playwright's role-based selector from
	// collapsing both triggers into a single match (it does substring
	// containment, so "Benutzermenü öffnen" would still match
	// "Sidebar-Benutzermenü öffnen"). Use a label that doesn't contain the
	// topbar label as a substring.
	const triggerAriaLabel = $derived(
		variant === 'sidebar' ? 'Benutzerkonto' : 'Benutzermenü öffnen',
	);
	const triggerTestId = $derived(
		variant === 'sidebar' ? 'sidebar-user-menu-trigger' : 'topbar-user-menu-trigger',
	);
	const signOutFormId = $derived(
		variant === 'sidebar' ? 'sidebar-sign-out-form' : 'sign-out-form',
	);
</script>

<DropdownMenu>
	{#if variant === 'sidebar'}
		<DropdownMenuTrigger
			class="w-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
			aria-label={triggerAriaLabel}
			data-testid={triggerTestId}
		>
			{#if collapsed}
				<div
					class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
					title={displayName}
				>
					{abbr}
				</div>
			{:else}
				<div
					class="flex items-center gap-3 rounded-md p-1 text-left transition-colors hover:bg-muted/60"
				>
					<div
						class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
						aria-hidden="true"
					>
						{abbr}
					</div>
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm font-medium text-foreground">{displayName}</p>
						<p class="truncate text-xs text-muted-foreground">{user.email}</p>
					</div>
				</div>
			{/if}
		</DropdownMenuTrigger>
	{:else}
		<!--
			Hit target is 44px (h-11 w-11) for comfortable touch, but the visible
			avatar circle stays 36px (h-9 w-9) so the chrome looks unchanged. The
			trigger is transparent padding around the avatar.
		-->
		<DropdownMenuTrigger
			class="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
			aria-label={triggerAriaLabel}
			data-testid={triggerTestId}
		>
			<span
				class="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
				aria-hidden="true"
			>
				{abbr}
			</span>
		</DropdownMenuTrigger>
	{/if}

	<DropdownMenuContent
		align={variant === 'sidebar' ? 'start' : 'end'}
		side={variant === 'sidebar' ? 'top' : 'bottom'}
		class="w-56"
	>
		<DropdownMenuLabel class="font-normal">
			<div class="flex flex-col space-y-1">
				<p class="text-sm font-medium leading-none">{displayName}</p>
				<p class="text-xs leading-none text-muted-foreground">{user.email}</p>
			</div>
		</DropdownMenuLabel>

		<DropdownMenuSeparator />

		<!-- Einstellungen — link via onSelect so we don't depend on asChild typing -->
		<DropdownMenuItem
			onSelect={() => {
				window.location.assign('/app/einstellungen');
			}}
			class="cursor-pointer"
			data-testid="user-menu-einstellungen"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="3" />
				<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
			</svg>
			Einstellungen
		</DropdownMenuItem>

		<!-- Hilfe — points to /app/dsgvo per spec ("Hilfe & Datenschutz") -->
		<DropdownMenuItem
			onSelect={() => {
				window.location.assign('/app/dsgvo');
			}}
			class="cursor-pointer"
			data-testid="user-menu-hilfe"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10" />
				<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
			Hilfe &amp; Datenschutz
		</DropdownMenuItem>

		<DropdownMenuSeparator />

		<DropdownMenuLabel
			class="text-[10px] font-normal text-muted-foreground"
			data-testid="user-menu-version"
		>
			Version {appVersion}
		</DropdownMenuLabel>

		<DropdownMenuSeparator />

		<!-- Sign-out: use onSelect to submit the form via JS (no asChild needed). -->
		<form method="POST" action="/sign-out?/signout" id={signOutFormId} class="hidden"></form>
		<DropdownMenuItem
			variant="destructive"
			onSelect={() => {
				(document.getElementById(signOutFormId) as HTMLFormElement | null)?.submit();
			}}
			class="cursor-pointer"
			data-testid="user-menu-abmelden"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
				<polyline points="16 17 21 12 16 7" />
				<line x1="21" y1="12" x2="9" y2="12" />
			</svg>
			Abmelden
		</DropdownMenuItem>
	</DropdownMenuContent>
</DropdownMenu>
