<!--
  MehrSheet — Aurora bottom sheet behind the "Mehr" tab (spec §5).

  Anatomy: grabber → profile row (avatar · name · role · Verein · "Konto")
  → 3-column tile grid (Projekte, Mitglieder, Jahresabschluss, Rechnungen,
  Kunden, Einstellungen — aurora-tinted icon chips, gradient-brand-soft)
  → footer (DSGVO & Datenschutz, Abmelden).

  History contract: open state IS a history entry (page.state.mehrSheet via
  SvelteKit shallow routing). MobileTabBar pushState()s it; dismissing calls
  history.back() so Android back / iOS swipe-back closes the sheet, not the
  page. Tile navigation uses goto(replaceState: true) — the sheet entry is
  REPLACED by the destination, never left behind.

  Motion: .fdw-sheet-bottom (app.css) — 320ms cubic-bezier(0.34,1.3,0.64,1)
  slide-up, reduced-motion fade. Drag-dismiss 1:1 from the grabber zone.
  A11y: bits-ui Dialog → role="dialog", focus trap, Esc, focus return.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import UsersIcon from '@lucide/svelte/icons/users';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import Building2Icon from '@lucide/svelte/icons/building-2';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Component } from 'svelte';
	import type { SessionUser } from '$lib/server/auth/index.js';

	const open = $derived(page.state.mehrSheet === true);

	// Focus-return (spec §5 keyboard/SR): pushState opens the sheet, which
	// bypasses bits-ui's trigger tracking — so Esc/back close won't restore
	// focus to the Mehr tab-bar button on its own. Capture the element that had
	// focus at open time (the Mehr trigger, which the user just activated) and
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
		if (page.state.mehrSheet !== true) return;
		const t = triggerEl;
		history.back();
		// Restore focus to the Mehr trigger after the state settles.
		setTimeout(() => t?.focus?.(), 0);
	}

	function navigate(href: string): void {
		// replaceState consumes the sheet's history entry (spec §5).
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(href, { replaceState: true });
	}

	const user = $derived(page.data['user'] as SessionUser);
	const vereinName = $derived(page.data['vereinName'] as string);

	const ROLE_LABELS: Record<SessionUser['role'], string> = {
		admin: 'Admin',
		steuerberater: 'Steuerberater',
		member_self_service: 'Mitglied'
	};

	const displayName = $derived(user?.name ?? user?.email ?? '');
	const initials = $derived(
		(user?.name ?? user?.email ?? '?')
			.split(/[\s@.]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => (p[0] ?? '').toUpperCase())
			.join('')
	);

	// Seasonal badge (spec §5): amber dot on Jahresabschluss while a prior
	// Buchungsjahr is still open — same predicate as the dashboard task
	// (spec §7: festgeschriebenBis < currentYear − 1). Years come from the
	// layout load (Berlin TZ) — NEVER new Date().getFullYear().
	const jahresDot = $derived(
		((page.data['festgeschriebenBis'] as number | null) ?? 0) <
			(page.data['currentYear'] as number) - 1
	);

	type Tile = { href: string; label: string; icon: Component };
	const TILES: Tile[] = [
		{ href: '/app/projekte', label: 'Projekte', icon: FolderOpenIcon },
		{ href: '/app/mitglieder', label: 'Mitglieder', icon: UsersIcon },
		{ href: '/app/jahresabschluss', label: 'Jahresabschluss', icon: BookOpenIcon },
		{ href: '/app/rechnungen', label: 'Rechnungen', icon: FileTextIcon },
		{ href: '/app/kunden', label: 'Kunden', icon: Building2Icon },
		{ href: '/app/einstellungen', label: 'Einstellungen', icon: SettingsIcon }
	];

	// ── Drag-dismiss 1:1 (grabber zone) ─────────────────────────────────────
	let dragY = $state(0);
	let dragging = $state(false);
	let startY = 0;

	function onPointerDown(e: PointerEvent): void {
		dragging = true;
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function onPointerMove(e: PointerEvent): void {
		if (!dragging) return;
		dragY = Math.max(0, e.clientY - startY);
	}
	function onPointerEnd(): void {
		if (!dragging) return;
		dragging = false;
		if (dragY > 96) {
			dragY = 0;
			dismiss();
		} else {
			dragY = 0;
		}
	}

	const dragStyle = $derived(
		dragging || dragY > 0 ? `transform: translateY(${dragY}px); transition: none;` : undefined
	);
</script>

<Sheet.Root bind:open={() => open, (v) => { if (!v) dismiss(); }}>
	<Sheet.Content
		side="bottom"
		showCloseButton={false}
		class="fdw-sheet-bottom gap-0 rounded-t-2xl border-hairline bg-background pb-[max(env(safe-area-inset-bottom),1rem)]"
		style={dragStyle}
		data-testid="mehr-sheet"
	>
		<!-- Grabber (4px grid) — also the drag-dismiss handle -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="cursor-grab touch-none pb-2 pt-2"
			data-testid="sheet-grabber"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerEnd}
			onpointercancel={onPointerEnd}
		>
			<div aria-hidden="true" class="mx-auto h-1 w-9 rounded-full bg-ink-300/50"></div>
		</div>

		<Sheet.Title class="sr-only">Mehr</Sheet.Title>
		<Sheet.Description class="sr-only">Weitere Bereiche und Konto</Sheet.Description>

		<!-- Profile row -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href="/app/einstellungen"
			onclick={(e) => {
				e.preventDefault();
				navigate('/app/einstellungen');
			}}
			class="mx-4 flex min-h-14 items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			data-testid="mehr-profile-row"
		>
			<span
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-brand-soft text-sm font-semibold text-primary-text"
				aria-hidden="true">{initials}</span
			>
			<span class="flex min-w-0 flex-1 flex-col">
				<span class="truncate text-sm font-semibold text-ink-900">{displayName}</span>
				<span class="truncate text-xs text-ink-500">{ROLE_LABELS[user?.role] ?? ''} · {vereinName}</span>
			</span>
			<span class="flex items-center gap-0.5 text-xs font-medium text-primary-text">
				Konto
				<ChevronRightIcon size={14} strokeWidth={2.5} aria-hidden="true" />
			</span>
		</a>

		<!-- 3-column tile grid -->
		<nav class="grid grid-cols-3 gap-2 px-4 pb-2 pt-3" aria-label="Weitere Bereiche">
			{#each TILES as tile (tile.href)}
				<div class="relative">
					{#if tile.href === '/app/jahresabschluss' && jahresDot}
						<!-- Close season (prior year open): amber dot — severity token,
						     never brand pink on a warning (spec §2). -->
						<span
							class="absolute right-[calc(50%-1.75rem)] top-1.5 z-10 h-2 w-2 rounded-full bg-severity-warn"
							data-testid="jahresabschluss-dot"
							aria-hidden="true"
						></span>
					{/if}
					<a
						href={tile.href}
						onclick={(e) => {
							e.preventDefault();
							navigate(tile.href);
						}}
						aria-label={tile.href === '/app/jahresabschluss' && jahresDot
							? `${tile.label} — Jahresabschluss offen`
							: tile.label}
						class="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2 text-center transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						data-testid="mehr-tile"
					>
						<span
							class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand-soft text-primary-text"
							aria-hidden="true"
						>
							<tile.icon size={20} strokeWidth={2} />
						</span>
						<span class="text-xs font-medium text-ink-700" aria-hidden="true">{tile.label}</span>
					</a>
				</div>
			{/each}
		</nav>

		<!-- Footer -->
		<div class="mx-4 mt-1 flex items-center justify-between border-t border-hairline pt-3">
			<a
				href="/app/dsgvo"
				onclick={(e) => {
					e.preventDefault();
					navigate('/app/dsgvo');
				}}
				class="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-ink-700 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<ShieldIcon size={16} strokeWidth={2} aria-hidden="true" />
				DSGVO &amp; Datenschutz
			</a>
			<form method="POST" action="/sign-out?/signout" class="contents">
				<button
					type="submit"
					class="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-ink-700 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					data-testid="mehr-abmelden"
				>
					<LogOutIcon size={16} strokeWidth={2} aria-hidden="true" />
					Abmelden
				</button>
			</form>
		</div>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</Sheet.Content>
</Sheet.Root>
