<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/**
	 * EntryFormShell prop contract — Task 8, Phase 3. CONTRACT-FIRST: the per-tab
	 * create/edit forms (Phases 4/5/6) bind to this EXACT shape. Matches the plan.
	 */
	export interface EntryFormShellProps {
		/** Sticky-header title, e.g. "Neue Ausgabe". */
		title: string;
		/** Optional secondary status line under the title (e.g. mode hint). */
		statusHint?: string;
		/** Form action, e.g. "?/create". */
		action: string;
		/**
		 * Form encoding. Defaults to `'multipart/form-data'` so file inputs (Beleg,
		 * Sachspende Herkunftsbeleg) transmit their bytes — a urlencoded POST drops
		 * them silently. Pass `'application/x-www-form-urlencoded'` for a file-free
		 * form if ever needed.
		 */
		enctype?:
			| 'multipart/form-data'
			| 'application/x-www-form-urlencoded'
			| 'text/plain';
		/** Footer Speichern label reflecting the mode, e.g. "Ausgabe anlegen". */
		submitLabel: string;
		/**
		 * True while the action is in flight — disables Speichern + skips the guard.
		 * `$bindable`: the shell flips this to `true` on the form's `submit` event
		 * (in the same tick the native POST begins), so the page no longer needs a
		 * fragile onMount `addEventListener` to set it. The page binds it (and may
		 * also read it, e.g. for the beforeNavigate skip on the success redirect).
		 */
		submitting: boolean;
		/** True once the form differs from its pristine state — gates Speichern + guard. */
		dirty: boolean;
		/** Per-tab fields injected into the scrollable body. */
		fields: Snippet;
		/** × / backdrop → navigate to the parent list; guarded if dirty (UX-02). */
		onClose: () => void;
		/**
		 * Per-type accent colour for the slim top gradient strip, the header
		 * type-badge and the Speichern CTA fill.
		 * ausgabe = rose/plum, einnahme = green, spende = violet.
		 * Defaults to `'ausgabe'`.
		 */
		accent?: 'ausgabe' | 'einnahme' | 'spende';
		/**
		 * Advisory Beleg-/Pflichtfeld readout in the footer (entry-modal-v4
		 * `.gate-line`): amber „Fehlt noch: …" while required fields are missing,
		 * green „Alles da." once complete. Purely informational — the server stays
		 * the enforcer, so the CTA is NOT gated on this (only on `dirty`). Omit to
		 * hide the readout.
		 */
		gateStatus?: { ok: boolean; text: string };
	}
</script>

<script lang="ts">
	/**
	 * EntryFormShell — the shared sticky-footer modal shell for transaction entry.
	 *
	 *   accent strip : slim per-type gradient at the very top of the dialog
	 *   sticky header: `title` (+ optional `statusHint`) + a × close control
	 *   scroll body  : `{@render fields()}` — the per-tab fields
	 *   sticky footer: unified — a single Speichern button reflecting `submitLabel`,
	 *                  disabled unless `dirty` (and not `submitting`). NO Verwerfen.
	 *
	 * D1: portals to document.body via bits-ui <Portal> so the modal escapes
	 * AdminShell's stacking context. Backdrop z-[60] covers Topbar(z-30) and
	 * MobileTabBar(z-40); dialog z-[70] sits above the backdrop.
	 *
	 * UX-02: the × (and the backdrop) call `onClose`, which the tab wires to navigate
	 * to the parent list — behaviorally identical to browser-back. The SAME
	 * `beforeNavigate` unsaved-changes guard fires on BOTH exits (× → onClose →
	 * goto, and a raw browser-back), because the guard lives here at the shell level
	 * and intercepts any navigation away while `dirty`.
	 */
	import { beforeNavigate } from '$app/navigation';
	import { focusTrap } from '$lib/actions/focus-trap.js';
	import { Portal } from 'bits-ui';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import CheckIcon from '@lucide/svelte/icons/check';
	import XIcon from '@lucide/svelte/icons/x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check-big';

	let {
		title,
		statusHint,
		action,
		enctype = 'multipart/form-data',
		submitLabel,
		submitting = $bindable(false),
		dirty,
		fields,
		onClose,
		accent = 'ausgabe',
		gateStatus,
	}: EntryFormShellProps = $props();

	// Accent strip CSS class derived from prop (no hardcoded hex — Aurora token).
	const accentClass = $derived(
		accent === 'einnahme'
			? 'bg-type-einnahme'
			: accent === 'spende'
				? 'bg-type-spende'
				: 'bg-type-ausgabe',
	);

	// Header type-badge: a tinted squircle + the type glyph (matches CreateSheet:
	// Ausgabe ↓/Minus · Einnahme ↑/Plus · Spende ♥/Heart).
	const BadgeIcon = $derived(
		accent === 'einnahme' ? PlusIcon : accent === 'spende' ? HeartIcon : MinusIcon,
	);
	const GateIcon = $derived(gateStatus?.ok ? CircleCheckIcon : TriangleAlertIcon);
	const badgeClass = $derived(
		accent === 'einnahme'
			? 'bg-type-einnahme-tint text-type-einnahme'
			: accent === 'spende'
				? 'bg-type-spende-tint text-type-spende'
				: 'bg-type-ausgabe-tint text-type-ausgabe',
	);

	// Speichern CTA fill — the SOLID booking-type colour (never the brand
	// gradient; ANDY-LENS §4). Disabled = flat neutral (kit btn-type:disabled).
	// In dark mode the type tokens turn light, so the label flips to --background
	// to hold the AA contrast (kit btn-type-cta.css).
	const ctaColorClass = $derived(
		accent === 'einnahme'
			? 'bg-type-einnahme'
			: accent === 'spende'
				? 'bg-type-spende'
				: 'bg-type-ausgabe',
	);
	const ctaDisabled = $derived(!dirty || submitting);

	// ── beforeNavigate dirty-guard (P1-B1 convention) ─────────────────────────
	// Fires on EVERY navigation away (× → onClose → goto AND browser-back) while
	// there are unsaved changes. Skipped on form-submit + leave-app (own UX) and
	// on same-path query updates. `dirty` is owned by the tab (it tracks its own
	// fields) and passed in — the shell just enforces the guard uniformly so both
	// exit paths behave identically (UX-02).
	beforeNavigate(({ cancel, from, to, type }) => {
		if (submitting) return;
		if (type === 'form' || type === 'leave') return;
		// Skip same-path (query-only) updates — but compare `from`→`to`, NOT
		// window.location. On a popstate (browser back/forward) the browser has
		// ALREADY moved window.location to the target before this fires, so
		// comparing against it wrongly matches and skips the guard for the very
		// back-navigation we must intercept (P16-03).
		if (from?.url.pathname === to?.url.pathname) return;
		if (!dirty) return;

		const confirmed = window.confirm('Änderungen gehen verloren. Trotzdem die Seite verlassen?');
		if (!confirmed) cancel();
	});
</script>

<!--
	D1: Portal to document.body so the modal escapes AdminShell's stacking context.
	Backdrop z-[60] covers Topbar(z-30) + MobileTabBar(z-40).
	Dialog z-[70] sits above the backdrop.
-->
<Portal>
	<!-- Backdrop — clicking it exits via the same onClose path as the × (UX-02). -->
	<div
		class="fixed inset-0 z-[60] bg-black/40"
		data-slot="entry-backdrop"
		onclick={onClose}
		role="presentation"
	></div>

	<!--
		Escape lives on the dialog (which contains the focusable content), NOT the
		backdrop — the backdrop is a sibling, so a keydown while focus is inside the
		dialog never bubbles to it. Escape → onClose → same beforeNavigate dirty-guard
		as the × and browser-back (UX-02).
	-->
	<div
		class="fixed inset-x-0 bottom-0 z-[70] mx-auto flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-hairline bg-background shadow-card sm:inset-y-8 sm:rounded-2xl"
		data-slot="entry-form-shell"
		role="dialog"
		aria-modal="true"
		aria-labelledby="entry-form-title"
		tabindex="-1"
		use:focusTrap
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		}}
	>
		<!-- ── Per-type accent strip (D1: slim gradient at top) ───────────────── -->
		<div
			data-slot="entry-accent"
			class="h-1 w-full shrink-0 {accentClass}"
			aria-hidden="true"
		></div>

		<!-- ── Sticky header ──────────────────────────────────────────────────── -->
		<header
			data-slot="entry-header"
			class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-hairline bg-background px-5 py-4"
		>
			<div class="flex min-w-0 items-center gap-3">
				<span
					class="flex size-10 shrink-0 items-center justify-center rounded-xl {badgeClass}"
					data-slot="entry-typebadge"
					aria-hidden="true"
				>
					<BadgeIcon class="size-5" strokeWidth={2.25} />
				</span>
				<div class="min-w-0">
					<h2 id="entry-form-title" class="truncate text-lg font-semibold text-foreground">{title}</h2>
					{#if statusHint}
						<p class="mt-0.5 truncate text-sm text-muted-foreground">{statusHint}</p>
					{/if}
				</div>
			</div>
			<button
				type="button"
				onclick={onClose}
				aria-label="Schließen"
				class="inline-flex size-9 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
			>
				<span aria-hidden="true" class="text-xl leading-none">×</span>
			</button>
		</header>

		<!-- ── Scrollable body: per-tab fields ────────────────────────────────── -->
		<!--
			Double-submit guard (robust, no onMount listener): flip `submitting` on the
			native `submit` event so the Speichern button below disables in the SAME tick
			the POST begins (`disabled={!dirty || submitting}`). A second Enter/click can't
			re-fire the submit. We do NOT preventDefault — the native POST proceeds. The
			page binds `submitting`, so its beforeNavigate dirty-guard also skips on the
			successful create-redirect.
		-->
		<form
			id="entry-form"
			method="POST"
			{action}
			{enctype}
			class="flex min-h-0 flex-1 flex-col"
			onsubmit={() => {
				submitting = true;
			}}
		>
			<div data-slot="entry-body" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				{@render fields()}
			</div>

			<!--
				── Sticky footer: gate-line readout + [Abbrechen · typfarbener CTA] ──
				The CTA carries the SOLID booking-type colour (never the brand
				gradient — ANDY-LENS §4); disabled = flat neutral. Abbrechen +
				Speichern share the row equally (flex-1, icon parity — ANDY-LENS §6);
				on mobile they stack with the CTA on top (flex-col-reverse), full
				width, safe-area padded. The gate-line readout (amber/green) is
				advisory only — the CTA gates on `dirty`, the server enforces.
			-->
			<footer
				data-slot="entry-footer"
				class="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-hairline bg-background px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
			>
				{#if gateStatus}
					<div
						class="flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-xs font-semibold leading-snug {gateStatus.ok
							? 'border-[color-mix(in_srgb,var(--type-einnahme)_25%,transparent)] bg-type-einnahme-tint text-type-einnahme'
							: 'border-[color-mix(in_srgb,var(--sev-warn)_30%,transparent)] bg-severity-warn-tint text-severity-warn-text'}"
						data-slot="entry-gate-line"
						data-ok={gateStatus.ok}
						role="status"
						aria-live="polite"
					>
						<GateIcon class="size-4 shrink-0" aria-hidden="true" />
						{gateStatus.text}
					</div>
				{/if}
				<div class="flex flex-col-reverse gap-3 sm:flex-row">
					<button
						type="button"
						onclick={onClose}
						class="inline-flex h-11 min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-hairline bg-card px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
					>
						<XIcon class="size-4" aria-hidden="true" />
						Abbrechen
					</button>
					<button
						type="submit"
						disabled={ctaDisabled}
						aria-busy={submitting}
						class="inline-flex h-11 min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 {ctaDisabled
							? 'cursor-not-allowed bg-secondary text-ink-500'
							: `${ctaColorClass} text-primary-foreground shadow-sm hover:brightness-105 active:brightness-95 dark:text-background`}"
					>
						<CheckIcon class="size-4" aria-hidden="true" />
						{submitLabel}
					</button>
				</div>
			</footer>
		</form>
	</div>
</Portal>
