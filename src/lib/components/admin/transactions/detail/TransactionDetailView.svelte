<script lang="ts" module>
	import type { Snippet } from "svelte";
	import type { TransactionDetail } from "$lib/server/domain/transactions.js";
	import type {
		DetailKind,
		DetailStatusChip,
	} from "$lib/components/admin/transactions/detail/DetailHead.svelte";

	/**
	 * DetailModalShell — despite the legacy name, the read-by-default FULL-PAGE
	 * detail container (detail-views-v4). Read mode is the default (no editable
	 * inputs in the DOM); „Bearbeiten" is a deliberate mode. The modal era
	 * (backdrop / role=dialog / „Schließen") is gone — this renders in normal page
	 * flow inside the AdminShell content region.
	 */
	export interface DetailShellProps {
		detail: TransactionDetail;
		kind: DetailKind;
		/**
		 * Read-only lock (festgeschrieben OR — for Spenden — bescheinigt). Hides
		 * „Bearbeiten" + the edit mode + Save. The SINGLE-boolean coupling is
		 * deliberate (contract risk H1): one flag → inert + no-edit.
		 */
		locked: boolean;
		/** Lock banner (info tone, never amber-alarm). null = no banner. The two
		 * lock reasons stay distinguishable in the copy (Judge-watch): a
		 * festgeschrieben year vs. an issued Bescheinigung (which names its Nr.). */
		lock?: {
			variant: "festgeschrieben" | "bescheinigt";
			year?: number | null;
			bescheinigungNr?: string | null;
		} | null;
		/** Money-head status chip (settled = neutral) + meta line. */
		statusChip?: DetailStatusChip;
		headMeta?: string;
		/** Read-mode LEFT column: the Details facts (a FactsList of KeyValue rows). */
		facts: Snippet;
		/** Rail Beleg (read): a BelegViewer or an honest „kein Beleg" line. */
		beleg?: Snippet;
		/** Rail extra above Verlauf (Spende BescheinigungCard). */
		railExtra?: Snippet;
		/** Read-mode head actions (per-kind: Als bezahlt markieren / duplizieren). */
		headActions?: Snippet;
		/** Edit-mode form fields — the `<form id="detail-form" action="?/save">`. */
		fields: Snippet;
		/** Edit-mode rail Beleg (with „ersetzen"); falls back to `beleg`. */
		belegEdit?: Snippet;
		/** Opens the staged delete confirm. Omitted → no delete affordance. */
		onDelete?: () => void;
		saving: boolean;
		dirty: boolean;
		/** Parent list route (Zurück + crumbs). */
		listHref: string;
		listLabel: string;
		/** Bindable so the tab can drop back to read after a successful save. */
		mode?: "read" | "edit";
	}
</script>

<script lang="ts">
	import { tick } from "svelte";
	import { beforeNavigate } from "$app/navigation";
	import ArrowLeft from "@lucide/svelte/icons/arrow-left";
	import Pencil from "@lucide/svelte/icons/pencil";
	import Lock from "@lucide/svelte/icons/lock";
	import X from "@lucide/svelte/icons/x";
	import Check from "@lucide/svelte/icons/check";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import RefreshCw from "@lucide/svelte/icons/refresh-cw";
	import DetailHead from "$lib/components/admin/transactions/detail/DetailHead.svelte";
	import DetailCard from "$lib/components/admin/transactions/detail/DetailCard.svelte";
	import StatusTimeline from "$lib/components/admin/transactions/detail/StatusTimeline.svelte";
	import GobdBlock from "$lib/components/admin/transactions/detail/GobdBlock.svelte";

	let {
		detail,
		kind,
		locked,
		lock = null,
		statusChip,
		headMeta,
		facts,
		beleg,
		railExtra,
		headActions,
		fields,
		belegEdit,
		onDelete,
		saving,
		dirty,
		listHref,
		listLabel,
		mode = $bindable("read"),
	}: DetailShellProps = $props();

	// A locked row can never enter edit mode (belt-and-braces beyond the hidden
	// „Bearbeiten"): force read whenever the lock is on.
	$effect(() => {
		if (locked && mode === "edit") mode = "read";
	});

	// ── dirty-guard (mirrors EntryFormShell / the old shell) ───────────────────
	// Fires on real path-change navigations while editing with unsaved changes.
	beforeNavigate(({ cancel, from, to, type }) => {
		if (saving) return;
		if (type === "form" || type === "leave") return;
		if (from?.url.pathname === to?.url.pathname) return;
		if (!dirty || mode !== "edit") return;
		if (!window.confirm("Änderungen gehen verloren. Trotzdem verlassen?"))
			cancel();
	});

	let editBtn = $state<HTMLButtonElement | null>(null);

	async function enterEdit() {
		mode = "edit";
		await tick();
		document
			.querySelector<HTMLElement>(
				'#detail-form input:not([type="hidden"]), #detail-form select, #detail-form textarea',
			)
			?.focus();
	}

	async function cancelEdit() {
		if (dirty && !window.confirm("Änderungen verwerfen?")) return;
		mode = "read";
		await tick();
		editBtn?.focus();
	}

	const CTA_COLOR: Record<DetailKind, string> = {
		expense: "bg-[var(--type-ausgabe)]",
		income: "bg-[var(--einnahme-ink-aa)]",
		donation: "bg-[var(--type-spende)]",
	};
</script>

<div
	class="mx-auto w-full max-w-[1180px]"
	data-slot="detail-page"
	data-mode={mode}
>
	<!-- ── Crumbs ────────────────────────────────────────────────────────────── -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -- listHref is a static same-origin parent-list route passed by the tab -->
	<nav
		class="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] font-medium text-ink-500"
		aria-label="Brotkrumen"
	>
		<a
			href={listHref}
			class="inline-flex items-center gap-1.5 font-semibold text-ink-700 hover:text-ink-900"
			data-slot="detail-back"
		>
			<ArrowLeft class="size-[15px]" aria-hidden="true" />Zurück
		</a>
		<span class="opacity-45" aria-hidden="true">·</span>
		<a href={listHref} class="hover:text-ink-900">{listLabel}</a>
		<span class="opacity-45" aria-hidden="true">/</span>
		<span class="font-bold tabular-nums text-ink-900">{detail.businessId}</span>
		{#if mode === "edit"}
			<span class="opacity-45" aria-hidden="true">/</span>
			<span class="text-ink-700">Bearbeiten</span>
		{/if}
	</nav>

	<!-- ── Lock banner (info tone — quiet, never amber-alarm) ─────────────────── -->
	{#if lock}
		<div
			class="mb-4 flex items-start gap-3 rounded-xl border border-[color:var(--sev-info)]/30 bg-[color:var(--sev-info)]/10 px-4 py-3"
			data-slot="detail-festschreibung-notice"
			role="note"
		>
			<span
				class="grid size-8 shrink-0 place-items-center rounded-lg bg-[color:var(--sev-info)]/15 text-[color:var(--sev-info)]"
				aria-hidden="true"><Lock class="size-4" /></span
			>
			<div class="min-w-0 text-sm">
				{#if lock.variant === "festgeschrieben"}
					<div class="font-semibold text-ink-900">
						Buchungsjahr {lock.year} ist festgeschrieben
					</div>
					<div class="mt-0.5 text-ink-700">
						Diese Buchung ist unveränderbar.{#if kind === "expense"} „Als bezahlt
							markieren" bleibt möglich — es ändert keine Buchungswerte.{/if}
					</div>
				{:else}
					<div class="font-semibold text-ink-900">
						{#if lock.bescheinigungNr}
							Zu dieser Spende wurde Bescheinigung Nr. {lock.bescheinigungNr} ausgestellt
						{:else}
							Bescheinigt — die Felder sind gesperrt
						{/if}
					</div>
					<div class="mt-0.5 text-ink-700">
						Bearbeiten und Löschen sind nicht möglich — Korrektur nur über Storno
						&amp; Neu-Erfassung (in einer späteren Ausbaustufe).
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- ── Money-first head ──────────────────────────────────────────────────── -->
	<div class="mb-5">
		<DetailHead
			{kind}
			businessId={detail.businessId}
			title={detail.bezeichnung}
			betragCents={detail.betragCents}
			{statusChip}
			meta={headMeta}
			compact={mode === "edit"}
		>
			{#snippet actions()}
				{@render headActions?.()}
				{#if !locked}
					<button
						type="button"
						bind:this={editBtn}
						onclick={enterEdit}
						class="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						data-slot="detail-edit-btn"
					>
						<Pencil class="size-4 text-ink-500" aria-hidden="true" />Bearbeiten
					</button>
				{/if}
			{/snippet}
		</DetailHead>
	</div>

	{#if mode === "edit"}
		<div
			class="mb-4 flex items-center gap-3 rounded-xl px-4 py-3"
			style="background: var(--gradient-brand-soft);"
			data-slot="detail-edit-banner"
		>
			<span
				class="grid size-8 shrink-0 place-items-center rounded-lg bg-card/70 text-ink-700"
				aria-hidden="true"><Pencil class="size-4" /></span
			>
			<p class="text-sm text-ink-700">Änderungen gelten erst nach „Speichern".</p>
		</div>
	{/if}

	<!-- ── Workbench: left main + right rail ─────────────────────────────────── -->
	<div
		class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"
		data-slot="detail-workbench"
	>
		<!-- LEFT -->
		<div class="min-w-0">
			{#if mode === "read"}
				<DetailCard heading="Details">
					{@render facts()}
				</DetailCard>
			{:else}
				<DetailCard heading="Angaben bearbeiten">
					<div data-slot="detail-fields">
						{@render fields()}
					</div>
				</DetailCard>
			{/if}
		</div>

		<!-- RIGHT rail -->
		<aside class="flex min-w-0 flex-col gap-5" data-slot="detail-rail">
			{#if mode === "edit" && belegEdit}
				<DetailCard heading="Beleg">{@render belegEdit()}</DetailCard>
			{:else if beleg}
				<DetailCard heading="Beleg">
					<div data-slot="detail-beleg">{@render beleg()}</div>
				</DetailCard>
			{/if}

			{@render railExtra?.()}

			{#if mode === "read"}
				<DetailCard heading="Verlauf">
					<div data-slot="detail-verlauf">
						<StatusTimeline entries={detail.timeline} />
					</div>
				</DetailCard>
				<GobdBlock />
			{/if}
		</aside>
	</div>

	<!-- ── Edit dock-foot: [Löschen] … [Abbrechen][Speichern typfarben] ──────── -->
	{#if mode === "edit"}
		<div
			class="mt-5 flex items-center gap-3 border-t border-hairline pt-4 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:bg-background/95 max-lg:px-4 max-lg:pb-[max(1rem,env(safe-area-inset-bottom))] max-lg:backdrop-blur"
			data-slot="detail-footer"
		>
			{#if onDelete}
				<button
					type="button"
					onclick={onDelete}
					class="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[color:var(--sev-critical-text)] transition-colors hover:bg-[color:var(--sev-critical)]/10"
					data-slot="detail-delete-btn"
				>
					<Trash2 class="size-4" aria-hidden="true" />Löschen
				</button>
			{/if}
			<span class="flex-1"></span>
			<button
				type="button"
				onclick={cancelEdit}
				class="inline-flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted"
			>
				<X class="size-4" aria-hidden="true" />Abbrechen
			</button>
			<button
				type="submit"
				form="detail-form"
				disabled={!dirty || saving}
				class="inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50 {CTA_COLOR[
					kind
				]}"
				data-slot="detail-save-btn"
			>
				{#if saving}
					<RefreshCw class="size-4 animate-spin" aria-hidden="true" />
				{:else}
					<Check class="size-4" aria-hidden="true" />
				{/if}
				Speichern
			</button>
		</div>
	{/if}
</div>
