<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { TransactionDetail } from '$lib/server/domain/transactions.js';

	/**
	 * DetailModalShell prop contract — Task 9, Phase 3. CONTRACT-FIRST: the
	 * per-tab `[id]` detail pages (Phases 4/5/6) bind to this EXACT shape.
	 * Matches the plan's `DetailModalShellProps` verbatim.
	 */
	export interface DetailModalShellProps {
		/** Shared detail subset incl. belegFileId/mime + per-kind fields + `timeline` (Task 4). */
		detail: TransactionDetail;
		/** True once the row is festgeschrieben → fields read-only, footer Save hidden. */
		isFestgeschrieben: boolean;
		/**
		 * The amber read-only notice text shown when `isFestgeschrieben`. Defaults
		 * to the Festschreibung wording ("Korrektur nur über Storno (Phase 2)").
		 * The Spenden detail passes the bescheinigt variant ("Bescheinigt — Storno
		 * + Neu-Erfassung (Phase 2)") so a bescheinigt-not-festgeschrieben Spende
		 * shows exactly ONE correct notice (no local-notice + shell-notice double).
		 */
		lockNotice?: string;
		/**
		 * Left column — the tab renders `<BelegViewer …>` (or nothing). The shell
		 * does NOT import BelegViewer and does NOT reach into `detail.belegFileId`;
		 * the tab supplies this slot so e.g. Spenden can render `belegFileId` AND/OR
		 * `herkunftsbelegFileId`. Omitted → the beleg column is not rendered.
		 */
		beleg?: Snippet;
		/** Per-kind editable fields (right column, above the Verlauf). */
		fields: Snippet;
		/**
		 * P3-02: a ZERO-param Snippet — the per-kind footer action (Als bezahlt /
		 * Bescheinigung / Rechnung-link info). The tab closes over its OWN
		 * `saving`/`dirty`; the shell just renders the snippet in the footer.
		 */
		workflowAction?: Snippet;
		/** True while a save is in flight — disables Speichern + skips the guard. */
		saving: boolean;
		/** True once the per-kind fields differ from pristine — gates Speichern + guard. */
		dirty: boolean;
		/** UX-02: × / backdrop → navigate to the parent list; guarded if dirty (same beforeNavigate guard as back). */
		onClose: () => void;
	}
</script>

<script lang="ts">
	/**
	 * DetailModalShell — the shared detail surface every transaction tab's `[id]`
	 * page renders.
	 *
	 *   Desktop: 2-column —
	 *     left  : `{@render beleg?.()}` (the tab renders <BelegViewer …> or nothing)
	 *     right : `{@render fields()}` (per-kind editable fields) + a Verlauf (the
	 *             audit timeline rendered from `detail.timeline`)
	 *   Mobile: stacked (the tab passes a `BelegViewer mode="fold"` into `beleg`),
	 *           sticky bottom action bar.
	 *
	 *   Sticky footer (unified): the per-kind `workflowAction` Snippet (P3-02) + a
	 *   single Speichern button, disabled unless `dirty` (and not `saving`). When
	 *   `isFestgeschrieben`: the fields region is read-only, the Speichern button is
	 *   HIDDEN, and an amber "Korrektur nur über Storno (Phase 2)" notice is shown.
	 *
	 * UX-02: the × (and the backdrop) call `onClose`, which the tab wires to
	 * navigate to the parent list — behaviorally identical to browser-back. The
	 * SAME `beforeNavigate` unsaved-changes guard fires on BOTH exits (× → onClose →
	 * goto, and a raw browser-back), because the guard lives here at the shell level
	 * and intercepts any navigation away while `dirty` (mirrors EntryFormShell).
	 */
	import { beforeNavigate } from '$app/navigation';
	import Lock from '@lucide/svelte/icons/lock';

	let {
		detail,
		isFestgeschrieben,
		lockNotice = 'Korrektur nur über Storno (Phase 2)',
		beleg,
		fields,
		workflowAction,
		saving,
		dirty,
		onClose,
	}: DetailModalShellProps = $props();

	// ── beforeNavigate dirty-guard (P1-B1 convention; mirrors EntryFormShell) ──
	// Fires on EVERY navigation away (× → onClose → goto AND browser-back) while
	// there are unsaved changes. Skipped on form-submit + leave-app and on
	// same-path query updates. `dirty` is owned by the tab and passed in — the
	// shell enforces the guard uniformly so both exit paths behave identically.
	beforeNavigate(({ cancel, to, type }) => {
		if (saving) return;
		if (type === 'form' || type === 'leave') return;
		if (to?.url.pathname === window.location.pathname) return;
		if (!dirty) return;

		const confirmed = window.confirm('Änderungen gehen verloren. Trotzdem die Seite verlassen?');
		if (!confirmed) cancel();
	});

	// ── Verlauf (audit timeline) labels — mirrors TransactionDetailPanel ──────
	const actionLabel: Record<string, string> = {
		create: 'Erstellt',
		update: 'Bearbeitet',
		approve: 'Genehmigt',
		reject: 'Abgelehnt',
		reimburse: 'Erstattet',
		import: 'Importiert',
		festschreibung: 'Festgeschrieben',
		storno: 'Storniert',
	};

	function fmtTs(iso: string): string {
		return new Date(iso).toLocaleString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}
</script>

<!-- Backdrop — clicking it exits via the same onClose path as the × (UX-02). -->
<div
	class="fixed inset-0 z-40 bg-black/40"
	data-slot="detail-backdrop"
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
	class="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-5xl flex-col rounded-t-xl border border-border bg-background shadow-xl sm:inset-y-8 sm:rounded-xl"
	data-slot="detail-modal-shell"
	role="dialog"
	aria-modal="true"
	aria-labelledby="detail-modal-title"
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
		data-slot="detail-header"
		class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background px-5 py-4"
	>
		<div class="min-w-0">
			<h2 id="detail-modal-title" class="truncate text-lg font-semibold text-foreground">
				{detail.bezeichnung}
			</h2>
			<p class="mt-0.5 truncate font-mono text-sm text-muted-foreground">{detail.businessId}</p>
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

	<!-- ── Body: 2-col on desktop (beleg | fields+Verlauf), stacked on mobile ─ -->
	<div data-slot="detail-body" class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-2">
		{#if beleg}
			<!-- Left column — the tab renders <BelegViewer …> into this slot. -->
			<section
				data-slot="detail-beleg"
				aria-label="Beleg"
				class="min-w-0 border-b border-border bg-muted/30 p-5 md:border-b-0 md:border-r"
			>
				{@render beleg()}
			</section>
		{/if}

		<!-- Right column — per-kind fields + the Verlauf. Spans full width if no beleg. -->
		<div class="flex min-w-0 flex-col gap-6 p-5 {beleg ? '' : 'md:col-span-2'}">
			{#if isFestgeschrieben}
				<div
					data-slot="detail-festschreibung-notice"
					class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
					role="note"
				>
					<Lock class="size-4 shrink-0" aria-hidden="true" />
					<span>{lockNotice}</span>
				</div>
			{/if}

			<!-- Per-kind fields. When festgeschrieben the shell signals read-only via
			     `data-readonly` + `inert` (the snippet's own inputs are owned by the
			     tab; `inert` removes them from tab order + blocks interaction). We use
			     a `data-` flag rather than `aria-readonly` because the latter is only
			     valid on a narrow set of roles, none of which fit a fields wrapper. -->
			<div
				data-slot="detail-fields"
				data-readonly={isFestgeschrieben ? 'true' : undefined}
				inert={isFestgeschrieben}
				class={isFestgeschrieben ? 'opacity-70' : ''}
			>
				{@render fields()}
			</div>

			<!-- ── Verlauf (audit timeline from detail.timeline) ──────────────── -->
			<section data-slot="detail-verlauf" aria-labelledby="detail-verlauf-heading">
				<h3 id="detail-verlauf-heading" class="mb-3 text-sm font-semibold text-foreground">
					Verlauf
				</h3>
				{#if detail.timeline.length === 0}
					<p class="text-sm text-muted-foreground">Noch keine Aktivitäten erfasst.</p>
				{:else}
					<ol class="relative space-y-4 border-l border-border pl-6">
						{#each detail.timeline as entry (entry.id)}
							<li class="relative">
								<div
									class="absolute -left-[25px] flex h-4 w-4 items-center justify-center rounded-full bg-background ring-2 ring-border"
								>
									<div class="h-2 w-2 rounded-full bg-primary/60"></div>
								</div>
								<div class="flex flex-wrap items-baseline gap-2">
									<span class="text-xs font-medium text-foreground">
										{actionLabel[entry.action] ?? entry.action}
									</span>
									<span class="text-xs text-muted-foreground">{fmtTs(entry.occurredAt)}</span>
									<span class="text-xs text-muted-foreground">
										· {entry.actorKind === 'user' ? 'Admin' : 'System'}
									</span>
								</div>
							</li>
						{/each}
					</ol>
				{/if}
			</section>
		</div>
	</div>

	<!-- ── Unified sticky footer: workflowAction + Speichern (hidden if festschr.) ─ -->
	<footer
		data-slot="detail-footer"
		class="sticky bottom-0 z-10 flex items-center justify-end gap-3 border-t border-border bg-background px-5 py-4"
	>
		{#if workflowAction}
			{@render workflowAction()}
		{/if}
		{#if !isFestgeschrieben}
			<button
				type="submit"
				form="detail-form"
				disabled={!dirty || saving}
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				Speichern
			</button>
		{/if}
	</footer>
</div>
