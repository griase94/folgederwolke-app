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
		/** True while the action is in flight — disables Speichern + skips the guard. */
		submitting: boolean;
		/** True once the form differs from its pristine state — gates Speichern + guard. */
		dirty: boolean;
		/** Per-tab fields injected into the scrollable body. */
		fields: Snippet;
		/** × / backdrop → navigate to the parent list; guarded if dirty (UX-02). */
		onClose: () => void;
	}
</script>

<script lang="ts">
	/**
	 * EntryFormShell — the shared sticky-footer modal shell for transaction entry.
	 *
	 *   sticky header : `title` (+ optional `statusHint`) + a × close control
	 *   scroll body   : `{@render fields()}` — the per-tab fields
	 *   sticky footer : unified — a single Speichern button reflecting `submitLabel`,
	 *                   disabled unless `dirty` (and not `submitting`). NO Verwerfen.
	 *
	 * UX-02: the × (and the backdrop) call `onClose`, which the tab wires to navigate
	 * to the parent list — behaviorally identical to browser-back. The SAME
	 * `beforeNavigate` unsaved-changes guard fires on BOTH exits (× → onClose →
	 * goto, and a raw browser-back), because the guard lives here at the shell level
	 * and intercepts any navigation away while `dirty`.
	 */
	import { beforeNavigate } from '$app/navigation';

	let {
		title,
		statusHint,
		action,
		enctype = 'multipart/form-data',
		submitLabel,
		submitting,
		dirty,
		fields,
		onClose,
	}: EntryFormShellProps = $props();

	// ── beforeNavigate dirty-guard (P1-B1 convention) ─────────────────────────
	// Fires on EVERY navigation away (× → onClose → goto AND browser-back) while
	// there are unsaved changes. Skipped on form-submit + leave-app (own UX) and
	// on same-path query updates. `dirty` is owned by the tab (it tracks its own
	// fields) and passed in — the shell just enforces the guard uniformly so both
	// exit paths behave identically (UX-02).
	beforeNavigate(({ cancel, to, type }) => {
		if (submitting) return;
		if (type === 'form' || type === 'leave') return;
		if (to?.url.pathname === window.location.pathname) return;
		if (!dirty) return;

		const confirmed = window.confirm('Änderungen gehen verloren. Trotzdem die Seite verlassen?');
		if (!confirmed) cancel();
	});
</script>

<!-- Backdrop — clicking it exits via the same onClose path as the × (UX-02). -->
<div
	class="fixed inset-0 z-40 bg-black/40"
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
	class="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-xl border border-border bg-background shadow-xl sm:inset-y-8 sm:rounded-xl"
	data-slot="entry-form-shell"
	role="dialog"
	aria-modal="true"
	aria-labelledby="entry-form-title"
	tabindex="-1"
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}}
>
	<!-- ── Sticky header ──────────────────────────────────────────────────── -->
	<header
		data-slot="entry-header"
		class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background px-5 py-4"
	>
		<div class="min-w-0">
			<h2 id="entry-form-title" class="truncate text-lg font-semibold text-foreground">{title}</h2>
			{#if statusHint}
				<p class="mt-0.5 truncate text-sm text-muted-foreground">{statusHint}</p>
			{/if}
		</div>
		<button
			type="button"
			onclick={onClose}
			aria-label="Schließen"
			class="inline-flex size-9 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<span aria-hidden="true" class="text-xl leading-none">×</span>
		</button>
	</header>

	<!-- ── Scrollable body: per-tab fields ────────────────────────────────── -->
	<form id="entry-form" method="POST" {action} {enctype} class="flex min-h-0 flex-1 flex-col">
		<div data-slot="entry-body" class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
			{@render fields()}
		</div>

		<!-- ── Unified sticky footer: Speichern only (no Verwerfen) ──────────── -->
		<footer
			data-slot="entry-footer"
			class="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-border bg-background px-5 py-4"
		>
			<button
				type="submit"
				disabled={!dirty || submitting}
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{submitLabel}
			</button>
		</footer>
	</form>
</div>
